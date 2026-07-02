#!/usr/bin/env node
/**
 * Multi-Model MCP Server v6.0
 *
 * providers.json 기반 플러그인 아키텍처
 *   - providers.json에 프로바이더를 추가/제거하면 코드 수정 없이 ask_<name> 툴이 생성된다.
 *   - kind: "openai-responses" | "openai-chat" | "cli" 3종을 지원.
 *
 * 기본 프로바이더:
 *   - GPT (openai-responses) : 인증 체인 api_key → codex_cli → chatgpt_oauth (ToS 준수 우선순위)
 *   - GLM (openai-chat)      : Z.ai API Key → OpenAI 호환 엔드포인트
 *
 * --selftest 플래그: @modelcontextprotocol/sdk 임포트 없이 providers.json 로드 결과만 점검하고 종료.
 * (sdk 임포트는 main() 안에서 동적으로 수행 — node_modules 없이도 --selftest 동작)
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { writeFile } from "fs/promises";
import { execFile } from "child_process";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));

// ───────────────────────────────────────────────
// 토큰 사용량 로깅
// ───────────────────────────────────────────────
const USAGE_LOG_PATH = join(homedir(), "mcp-servers", "multi-model", "usage-log.jsonl");

function logUsage(model, inputTokens, outputTokens, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    ...extra, // category, retry_count, routing, reasoning_effort, kind 등
  };
  try {
    appendFileSync(USAGE_LOG_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // 로깅 실패해도 메인 기능에 영향 없음
  }
}

function getUsageStats(days = 7) {
  if (!existsSync(USAGE_LOG_PATH)) return "사용 기록 없음 (아직 외부 모델 호출 없음)";

  const lines = readFileSync(USAGE_LOG_PATH, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const byModel = {};
  const byCategory = {};
  let grandInput = 0, grandOutput = 0, grandCalls = 0;

  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (new Date(e.timestamp) < cutoff) continue;

      // 모델별 집계
      if (!byModel[e.model]) byModel[e.model] = { input: 0, output: 0, calls: 0 };
      byModel[e.model].input += e.input_tokens;
      byModel[e.model].output += e.output_tokens;
      byModel[e.model].calls++;
      grandInput += e.input_tokens;
      grandOutput += e.output_tokens;
      grandCalls++;

      // 카테고리별 집계
      if (e.category) {
        if (!byCategory[e.category]) byCategory[e.category] = 0;
        byCategory[e.category]++;
      }
    } catch { /* skip malformed */ }
  }

  if (grandCalls === 0) return `최근 ${days}일간 외부 모델 호출 없음`;

  const grandTotal = grandInput + grandOutput;

  const out = [
    `=== 외부 모델 토큰 사용 현황 (최근 ${days}일) ===`,
    "",
    `${"모델".padEnd(18)} ${"호출".padStart(5)} ${"입력".padStart(9)} ${"출력".padStart(8)} ${"합계".padStart(9)} ${"비율".padStart(6)}`,
    "─".repeat(60),
  ];

  for (const [model, s] of Object.entries(byModel)) {
    const total = s.input + s.output;
    const pct = ((total / grandTotal) * 100).toFixed(1);
    out.push(
      `${model.padEnd(18)} ${String(s.calls).padStart(5)} ${String(s.input).padStart(9)} ${String(s.output).padStart(8)} ${String(total).padStart(9)} ${(pct + "%").padStart(6)}`
    );
  }

  out.push("─".repeat(60));
  out.push(
    `${"합계".padEnd(18)} ${String(grandCalls).padStart(5)} ${String(grandInput).padStart(9)} ${String(grandOutput).padStart(8)} ${String(grandTotal).padStart(9)} ${"100%".padStart(6)}`
  );

  if (Object.keys(byCategory).length > 0) {
    out.push("");
    out.push("=== 카테고리별 호출 ===");
    for (const [cat, cnt] of Object.entries(byCategory)) {
      out.push(`  ${cat.padEnd(12)}: ${cnt}회`);
    }
  }

  out.push("");
  out.push("※ Claude 토큰은 claude.ai/settings/billing 에서 확인");

  return out.join("\n");
}

// ───────────────────────────────────────────────
// fetchWithRetry — 재시도 로직
// 429/500/502/503/529 → 최대 3회, 지수 백오프 + 랜덤 지터
// 400/401/404 → 즉시 실패
// ───────────────────────────────────────────────
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);

// reasoning_effort별 타임아웃 (ms) — none/low는 빠른 응답, xhigh는 긴 추론 허용
const DEFAULT_TIMEOUT = 120_000;
const EFFORT_TIMEOUT = {
  none:   30_000,
  low:    45_000,
  medium: 60_000,
  high:   90_000,
  xhigh:  120_000,
};

async function fetchWithRetry(url, options, maxRetries = 3, timeoutMs = DEFAULT_TIMEOUT) {
  let retryCount = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error(`API 타임아웃 (${timeoutMs / 1000}초 초과)`);
      if (retryCount >= maxRetries) throw err;
      const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
      retryCount++;
      continue;
    }
    if (res.ok) return { res, retryCount };
    if (!RETRYABLE_STATUS.has(res.status) || retryCount >= maxRetries) {
      return { res, retryCount };
    }
    const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 500;
    await new Promise((r) => setTimeout(r, delay));
    retryCount++;
  }
}

// ───────────────────────────────────────────────
// providers.json 로드 — 실패 시 내장 기본값으로 폴백
// ───────────────────────────────────────────────
const DEFAULT_PROVIDERS_CONFIG = {
  schema_version: 1,
  providers: {
    gpt: {
      enabled: true,
      label: "GPT",
      kind: "openai-responses",
      base_url: "https://api.openai.com/v1",
      auth: {
        api_key_env: "OPENAI_API_KEY",
        auth_priority: ["api_key", "codex_cli", "chatgpt_oauth"],
        allow_chatgpt_oauth: false,
      },
      default_model: "gpt-5.3-codex",
      models: ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-max"],
      supports_reasoning_effort: true,
      description: "복잡한 코드리뷰, 알고리즘, 아키텍처",
    },
    glm: {
      enabled: true,
      label: "GLM",
      kind: "openai-chat",
      base_url: "https://api.z.ai/api/paas/v4",
      auth: { api_key_env: "GLM_API_KEY" },
      default_model: "glm-5",
      models: ["glm-5"],
      max_tokens_default: 4096,
      supports_temperature: true,
      description: "보일러플레이트, 볼륨 작업 — 비용 효율 최우선",
    },
  },
  routing: {
    ultrabrain: { provider: "gpt", effort: "xhigh", fallback: ["glm"] },
    deep:       { provider: "gpt", effort: "high",  fallback: ["glm"] },
    visual:     { provider: "gpt", effort: "high",  fallback: ["glm"] },
    research:   { provider: "gpt", effort: "high",  fallback: ["glm"] },
    bulk:       { provider: "glm", fallback: ["gpt"], fallback_effort: "medium" },
    writing:    { provider: "glm", fallback: ["gpt"], fallback_effort: "medium" },
    quick:      { provider: "gpt", effort: "none", fallback: ["glm"] },
  },
  parallel_default: ["gpt", "glm"],
};

function loadProviders() {
  const providersPath = join(SELF_DIR, "providers.json");
  let parsed;
  try {
    const raw = readFileSync(providersPath, "utf8");
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(
      `[경고] providers.json 로드 실패(${err.message}) — 내장 기본값으로 폴백합니다.\n`
    );
    return DEFAULT_PROVIDERS_CONFIG;
  }

  if (parsed.schema_version !== 1) {
    process.stderr.write(
      `[경고] providers.json schema_version(${parsed.schema_version})이 지원 범위(1) 밖입니다 — 내장 기본값으로 폴백합니다.\n`
    );
    return DEFAULT_PROVIDERS_CONFIG;
  }

  return parsed;
}

function getEnabledProviderNames(providers) {
  return Object.entries(providers.providers ?? {})
    .filter(([, cfg]) => cfg.enabled)
    .map(([name]) => name);
}

function isLocalBaseUrl(baseUrl) {
  if (!baseUrl) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(baseUrl);
}

// ───────────────────────────────────────────────
// GPT 인증 체인 — api_key → codex_cli → chatgpt_oauth (ToS 준수 우선순위)
// auth.json 구조: { tokens: { access_token, refresh_token }, OPENAI_API_KEY, last_refresh }
// ───────────────────────────────────────────────
const CODEX_AUTH_PATH = join(homedir(), ".codex", "auth.json");
const TOKEN_REFRESH_URL = "https://auth.openai.com/oauth/token";

let refreshPromise = null;
let chatgptOauthWarned = false;
let codexAvailableCache = null;

function readAuthJson() {
  if (!existsSync(CODEX_AUTH_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CODEX_AUTH_PATH, "utf8"));
  } catch {
    return null;
  }
}

function getJwtInfo(token) {
  try {
    const payload = token.split(".")[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return {
      exp: decoded.exp ?? 0,
      scopes: decoded.scp ?? decoded.scope ?? [],
      clientId: decoded.client_id ?? null,
    };
  } catch {
    return { exp: 0, scopes: [], clientId: null };
  }
}

const SCOPE_RE_LOGIN_MSG =
  "`OPENAI_API_KEY` 설정 또는 서버에서 `codex login` 실행을 권장합니다.\n" +
  "브라우저 없는 서버에서 auth.json 복사가 불가피하면 전용 사용자 계정으로 복사하고 `chmod 600 ~/.codex/auth.json`을 적용하세요.\n" +
  "※ OpenAI refresh grant가 api.responses.write 스코프를 유지하지 않는 제한입니다.";

async function doRefreshToken(refreshToken, clientId) {
  const body = { grant_type: "refresh_token", refresh_token: refreshToken };
  if (clientId) body.client_id = clientId;
  const res = await fetch(TOKEN_REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`토큰 갱신 실패 (HTTP ${res.status}): ${err}`);
  }
  return await res.json();
}

// api_key_env 환경변수 → auth.json 동일 필드 순으로 조회 (없으면 null)
function getApiKeyForProvider(authCfg) {
  const envName = authCfg?.api_key_env;
  if (!envName) return null;
  if (process.env[envName]) return process.env[envName];
  const auth = readAuthJson();
  if (auth?.[envName]) return auth[envName];
  return null;
}

// codex CLI 실행 가능 여부 — execFile로 1회만 확인 후 캐시
async function checkCodexAvailable() {
  if (codexAvailableCache !== null) return codexAvailableCache;
  codexAvailableCache = await new Promise((resolve) => {
    execFile("codex", ["--version"], { timeout: 5000 }, (err) => resolve(!err));
  });
  return codexAvailableCache;
}

// ChatGPT OAuth 토큰 획득/갱신 (auth_priority의 chatgpt_oauth 단계에서만 호출)
async function getValidChatGptOauthToken() {
  const auth = readAuthJson();
  if (!auth) {
    throw new Error("auth.json이 없습니다. `codex login`으로 ChatGPT OAuth 인증을 진행하세요.");
  }

  const tokens = auth.tokens ?? auth;
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;

  if (!accessToken) {
    throw new Error("access_token이 없습니다. `codex login`으로 재인증이 필요합니다.");
  }

  const { exp: expiry, scopes, clientId } = getJwtInfo(accessToken);

  // ChatGPT OAuth 토큰은 api.responses.write 스코프 필요
  // (refresh로는 이 스코프를 얻을 수 없음 — OpenAI 플랫폼 제한)
  if (!scopes.includes("api.responses.write")) {
    throw new Error(
      `auth.json ChatGPT 토큰에 api.responses.write 스코프가 없습니다.\n` +
      `OPENAI_API_KEY(sk-...) 설정을 권장합니다.\n${SCOPE_RE_LOGIN_MSG}`
    );
  }

  const isExpired = expiry > 0 && Date.now() / 1000 > expiry - 60;
  if (!isExpired) return accessToken;

  if (!refreshToken) {
    throw new Error("토큰이 만료되었고 refresh_token이 없습니다. `codex login`으로 재인증하세요.");
  }

  if (!refreshPromise) {
    refreshPromise = doRefreshToken(refreshToken, clientId)
      .then((refreshed) => {
        const { scopes: newScopes } = getJwtInfo(refreshed.access_token);
        const newAuth = {
          ...auth,
          tokens: {
            ...(auth.tokens ?? {}),
            access_token: refreshed.access_token,
            ...(refreshed.refresh_token && { refresh_token: refreshed.refresh_token }),
          },
          last_refresh: new Date().toISOString(),
        };
        writeFileSync(CODEX_AUTH_PATH, JSON.stringify(newAuth, null, 2));
        if (!newScopes.includes("api.responses.write")) {
          throw new Error(`토큰 갱신 후 api.responses.write 스코프 소실.\n${SCOPE_RE_LOGIN_MSG}`);
        }
        return refreshed.access_token;
      })
      .finally(() => { refreshPromise = null; });
  }

  try {
    return await refreshPromise;
  } catch (e) {
    throw new Error(`액세스 토큰 갱신 실패: ${e.message}`);
  }
}

// auth_priority를 순서대로 시도해 실제 호출 방식을 결정
async function resolveGptAuth(provider) {
  const authCfg = provider.auth ?? {};
  const priority = authCfg.auth_priority?.length ? authCfg.auth_priority : ["api_key"];

  for (const method of priority) {
    if (method === "api_key") {
      const key = getApiKeyForProvider(authCfg);
      if (key) return { method: "api_key", token: key };
    } else if (method === "codex_cli") {
      if (await checkCodexAvailable()) return { method: "codex_cli" };
    } else if (method === "chatgpt_oauth") {
      if (authCfg.allow_chatgpt_oauth) {
        if (!chatgptOauthWarned) {
          process.stderr.write(
            "[ToS 주의] ChatGPT OAuth 토큰의 API 직접 호출은 OpenAI 이용약관 위반 소지가 있습니다. " +
            "OPENAI_API_KEY 또는 codex CLI 사용을 권장합니다.\n"
          );
          chatgptOauthWarned = true;
        }
        const token = await getValidChatGptOauthToken();
        return { method: "chatgpt_oauth", token };
      }
    }
  }

  throw new Error(
    `${provider.label} 인증 실패. 다음 중 하나를 설정하세요:\n` +
    `  방법 1) ${authCfg.api_key_env ?? "API_KEY"} 환경변수 설정 (정식 API 키 — 권장)\n` +
    `  방법 2) codex CLI 설치 후 \`codex login\` (PATH에 codex 필요 — 공식 클라이언트 경유)\n` +
    `  방법 3) providers.json의 auth.allow_chatgpt_oauth를 true로 설정 후 \`codex login\`\n` +
    `         (ChatGPT OAuth 토큰 직접 호출은 OpenAI 이용약관 위반 소지가 있어 기본 비활성화)`
  );
}

// ───────────────────────────────────────────────
// CLI 프로바이더 실행 — 공식 CLI 서브프로세스 (execFile, shell 금지)
// ───────────────────────────────────────────────
const CLI_TIMEOUT_MS = 300_000;
const CLI_MAX_BUFFER = 10 * 1024 * 1024;
const CODEX_CLI_COMMAND = ["codex", "exec", "--model", "{model}", "{prompt}"];

async function execCli(commandTemplate, { model, prompt, promptVia = "arg" }) {
  const [cmd, ...restTemplate] = commandTemplate;
  let args;
  let stdinInput = null;

  if (promptVia === "stdin") {
    args = restTemplate
      .filter((part) => part !== "{prompt}")
      .map((part) => part.replace(/\{model\}/g, model ?? ""));
    stdinInput = prompt ?? "";
  } else {
    args = restTemplate.map((part) =>
      part.replace(/\{model\}/g, model ?? "").replace(/\{prompt\}/g, prompt ?? "")
    );
  }

  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { timeout: CLI_TIMEOUT_MS, maxBuffer: CLI_MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`CLI 실행 실패 (${cmd}): ${err.message}${stderr ? `\n${stderr}` : ""}`));
          return;
        }
        resolve(stdout);
      }
    );
    if (stdinInput !== null) {
      child.stdin.write(stdinInput);
      child.stdin.end();
    }
  });
}

// ───────────────────────────────────────────────
// callOpenAiResponses — kind: "openai-responses" (GPT, Responses API)
// ───────────────────────────────────────────────
async function callOpenAiResponses(provider, { prompt, model, systemPrompt, reasoningEffort = "medium", maxTokens, logExtra = {} }) {
  const auth = await resolveGptAuth(provider);
  const resolvedModel = model || provider.default_model;

  // codex CLI 경유 — 공식 클라이언트를 통한 실행이므로 별도 서브프로세스로 위임
  if (auth.method === "codex_cli") {
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const stdout = await execCli(CODEX_CLI_COMMAND, { model: resolvedModel, prompt: fullPrompt, promptVia: "arg" });
    logUsage(resolvedModel, 0, 0, { kind: "cli", auth_method: "codex_cli", ...logExtra });
    return stdout.trim();
  }

  const input = [];
  if (systemPrompt) input.push({ role: "system", content: systemPrompt });
  input.push({ role: "user", content: prompt });

  const body = { model: resolvedModel, input };
  if (provider.supports_reasoning_effort && reasoningEffort !== "none") {
    body.reasoning = { effort: reasoningEffort };
  }
  if (maxTokens) body.max_output_tokens = maxTokens;

  const timeoutMs = EFFORT_TIMEOUT[reasoningEffort] ?? DEFAULT_TIMEOUT;
  const { res, retryCount } = await fetchWithRetry(`${provider.base_url}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, 3, timeoutMs);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider.label} API 오류 (HTTP ${res.status}): ${err}`);
  }

  const data = await res.json();
  const usage = data.usage ?? {};
  logUsage(resolvedModel, usage.input_tokens ?? 0, usage.output_tokens ?? 0, {
    reasoning_tokens: usage.reasoning_tokens ?? 0,
    reasoning_effort: reasoningEffort,
    retry_count: retryCount,
    auth_method: auth.method,
    ...logExtra,
  });

  const texts = [];
  for (const item of data.output ?? []) {
    if (item.type === "message") {
      for (const block of item.content ?? []) {
        if (block.type === "output_text" && block.text) texts.push(block.text);
      }
    }
  }

  if (texts.length === 0) {
    return `[응답 파싱 실패] raw: ${JSON.stringify(data.output ?? data).slice(0, 500)}`;
  }
  return texts.join("\n");
}

// ───────────────────────────────────────────────
// callOpenAiChat — kind: "openai-chat" (GLM 및 OpenAI 호환 API 전부: DeepSeek/Groq/OpenRouter/Ollama 등)
// provider 객체(base_url, auth.api_key_env, models 등)만 참조 — 신규 프로바이더 추가 시 코드 수정 불필요
// ───────────────────────────────────────────────
function resolveApiKeyForChat(provider) {
  const authCfg = provider.auth ?? {};
  const key = getApiKeyForProvider(authCfg);
  if (key) return key;
  if (isLocalBaseUrl(provider.base_url)) return null; // Ollama 등 로컬 엔드포인트는 키 불필요
  throw new Error(
    `${provider.label} 인증 실패: ${authCfg.api_key_env ?? "API 키"} 환경변수가 필요합니다.`
  );
}

async function callOpenAiChat(provider, { prompt, model, systemPrompt, maxTokens, temperature, logExtra = {} }) {
  const apiKey = resolveApiKeyForChat(provider);
  const resolvedModel = model || provider.default_model;

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const body = {
    model: resolvedModel,
    messages,
    max_tokens: maxTokens ?? provider.max_tokens_default ?? 4096,
  };
  if (provider.supports_temperature && temperature !== null && temperature !== undefined) {
    body.temperature = temperature;
  }

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const { res, retryCount } = await fetchWithRetry(`${provider.base_url}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider.label} API 오류 (HTTP ${res.status}): ${err}`);
  }

  const data = await res.json();
  const usage = data.usage ?? {};
  logUsage(resolvedModel, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0, {
    retry_count: retryCount,
    ...logExtra,
  });

  return data.choices?.[0]?.message?.content ?? "응답 없음";
}

// ───────────────────────────────────────────────
// callCliProvider — kind: "cli" (공식 CLI 서브프로세스 일반화)
// provider.command: ["codex", "exec", "--model", "{model}", "{prompt}"] 형태 템플릿
// ───────────────────────────────────────────────
async function callCliProvider(provider, { prompt, model, systemPrompt, logExtra = {} }) {
  const resolvedModel = model || provider.default_model;
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const stdout = await execCli(provider.command, {
    model: resolvedModel,
    prompt: fullPrompt,
    promptVia: provider.prompt_via ?? "arg",
  });

  logUsage(resolvedModel, 0, 0, { kind: "cli", ...logExtra });
  return stdout.trim();
}

// ───────────────────────────────────────────────
// callProvider — kind별 디스패치
// ───────────────────────────────────────────────
async function callProvider(provider, opts) {
  switch (provider.kind) {
    case "openai-responses":
      return callOpenAiResponses(provider, opts);
    case "openai-chat":
      return callOpenAiChat(provider, opts);
    case "cli":
      return callCliProvider(provider, opts);
    default:
      throw new Error(`알 수 없는 provider kind: ${provider.kind}`);
  }
}

// ───────────────────────────────────────────────
// smart_route — 카테고리 기반 자동 라우팅 (CATEGORY_PATTERNS는 코드 고정, 라우팅 테이블은 providers.json)
// ───────────────────────────────────────────────
const CATEGORY_PATTERNS = {
  ultrabrain: /아키텍처.*설계|설계.*아키텍처|system.?design|전체.*전략|전략.*결정|architecture|design.?pattern|comprehensive.*plan|전체.*구조.*파악/i,
  deep: /알고리즘|algorithm|복잡도|complexity|최적화.*방법|optim.*approach|리팩토링|refactor|버그.*분석|deep.*debug|심층.*분석/i,
  visual: /\bUI\b|\bUX\b|컴포넌트|component|\breact\b|\bvue\b|\bangular\b|tailwind|화면.*설계|설계.*화면|스크린샷|screenshot|프론트엔드|frontend|CSS.*레이아웃/i,
  research: /코드베이스|codebase|레포.*전체|전체.*레포|entire.*repo|full.*codebase|파일.*여러.*분석|여러.*파일.*동시|전체.*파일.*구조/i,
  bulk: /보일러플레이트|boilerplate|\bCRUD\b|마이그레이션|migration|시드.*데이터|seed.*data|반복.*패턴.*생성|여러.*개.*파일.*생성|multiple.*similar.*files/i,
  writing: /문서.*작성|작성.*문서|\bREADME\b|주석.*추가|추가.*주석|기술.*문서|technical.*doc|\bAPI.*docs?\b|javadoc|jsdoc/i,
  quick: /간단.*변환|변환.*간단|빠르게|포맷.*변환|format.*convert|단순.*변경|단순.*수정/i,
};

function classifyCategory(task) {
  for (const [cat, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(task)) return cat;
  }
  return null; // 분류 불가 → 호출자가 기본값 결정
}

function pickFirstEnabled(names, enabledSet) {
  for (const name of names ?? []) {
    if (enabledSet.has(name)) return name;
  }
  return null;
}

async function callSmartRoute(providers, task, category = null, context = null, maxTokens = null) {
  const enabledNames = getEnabledProviderNames(providers);
  const enabledSet = new Set(enabledNames);
  if (enabledSet.size === 0) {
    throw new Error("smart_route 사용 불가 — enabled 프로바이더가 하나도 없습니다.");
  }

  const cat = category ?? classifyCategory(task) ?? "deep";
  const routing = providers.routing?.[cat] ?? providers.routing?.deep;
  if (!routing) throw new Error(`라우팅 설정 없음: ${cat}`);

  const fullPrompt = context ? `[컨텍스트]\n${context}\n\n[작업]\n${task}` : task;

  let primaryName = routing.provider;
  let primaryEffort = routing.effort ?? null;
  let primaryDisabledNote = "";

  // primary가 disabled면 fallback 체인에서 첫 enabled 프로바이더로 대체
  if (!enabledSet.has(primaryName)) {
    const fb = pickFirstEnabled(routing.fallback, enabledSet);
    if (!fb) {
      throw new Error(`smart_route(${cat}): 사용 가능한(enabled) 프로바이더가 없습니다.`);
    }
    primaryDisabledNote = ` (${primaryName} disabled)`;
    primaryName = fb;
    primaryEffort = routing.fallback_effort ?? primaryEffort;
  }

  async function tryProvider(name, effort, logExtra) {
    const cfg = providers.providers[name];
    if (!cfg || !cfg.enabled) throw new Error(`프로바이더 비활성화: ${name}`);
    return callProvider(cfg, {
      prompt: fullPrompt,
      model: cfg.default_model,
      systemPrompt: null,
      reasoningEffort: effort ?? "medium",
      maxTokens,
      temperature: null,
      logExtra,
    });
  }

  try {
    const result = await tryProvider(primaryName, primaryEffort, {
      category: cat,
      routing: `smart_route→${primaryName}`,
    });
    return `[smart_route: ${cat} → ${primaryName}${primaryDisabledNote}]\n\n${result}`;
  } catch (primaryErr) {
    for (const fbName of routing.fallback ?? []) {
      if (fbName === primaryName || !enabledSet.has(fbName)) continue;
      try {
        const result = await tryProvider(fbName, routing.fallback_effort, {
          category: cat,
          routing: `smart_route→${primaryName}(fail)→${fbName}`,
        });
        return `[smart_route: ${cat} → ${fbName} (${primaryName} 실패 후 폴백)]\n\n${result}`;
      } catch {
        // 다음 폴백으로 계속
      }
    }
    throw new Error(`smart_route 전체 실패 — 모든 폴백 소진 (1차 오류: ${primaryErr.message})`);
  }
}

// ───────────────────────────────────────────────
// ask_parallel — Promise.allSettled() 다중 모델 동시 호출 (대상 = parallel_default ∩ enabled)
// ───────────────────────────────────────────────
async function callAskParallel(providers, prompt, models = null, systemPrompt = null, reasoningEffort = "medium") {
  const enabledNames = getEnabledProviderNames(providers);
  const defaultTargets = (providers.parallel_default ?? enabledNames).filter((m) => enabledNames.includes(m));
  const requested = (models ?? []).filter((m) => enabledNames.includes(m));
  const selected = requested.length > 0 ? requested : defaultTargets;

  if (selected.length === 0) {
    throw new Error("ask_parallel 사용 불가 — enabled 프로바이더가 하나도 없습니다.");
  }

  const logExtra = { routing: "ask_parallel" };

  const results = await Promise.allSettled(
    selected.map((name) => {
      const cfg = providers.providers[name];
      return callProvider(cfg, {
        prompt,
        model: cfg.default_model,
        systemPrompt,
        reasoningEffort,
        maxTokens: null,
        temperature: null,
        logExtra,
      });
    })
  );

  return results
    .map((r, i) => {
      const cfg = providers.providers[selected[i]];
      const label = cfg?.label ?? selected[i].toUpperCase();
      return r.status === "fulfilled"
        ? `=== ${label} [OK] ===\n${r.value}`
        : `=== ${label} [FAIL] ===\n${r.reason?.message ?? "알 수 없는 오류"}`;
    })
    .join("\n\n");
}

// ───────────────────────────────────────────────
// 툴 정의 동적 생성 — enabled 프로바이더마다 ask_<name> 생성
// ───────────────────────────────────────────────
function buildSmartRouteDescription(providers) {
  const lines = [
    "작업을 카테고리로 분류하여 최적 모델에 자동 라우팅합니다. (OMO 스타일)",
    "",
    "【카테고리 → 모델 매핑】",
  ];
  for (const [cat, r] of Object.entries(providers.routing ?? {})) {
    const label = providers.providers[r.provider]?.label ?? r.provider;
    const effortNote = r.effort ? `(${r.effort})` : "";
    lines.push(`- ${cat.padEnd(10)} : ${label}${effortNote}`);
  }
  lines.push("", "【폴백 체인】 primary 실패(또는 disabled) 시 enabled 프로바이더로 자동 폴백");
  for (const [cat, r] of Object.entries(providers.routing ?? {})) {
    if (!r.fallback?.length) continue;
    const primaryLabel = providers.providers[r.provider]?.label ?? r.provider;
    const fbLabels = r.fallback.map((f) => providers.providers[f]?.label ?? f).join(" → ");
    lines.push(`- ${cat.padEnd(10)} : ${primaryLabel} → ${fbLabels}`);
  }
  return lines.join("\n");
}

function buildAskParallelDescription(providers) {
  const defaultLabels = (providers.parallel_default ?? [])
    .map((name) => providers.providers[name]?.label ?? name)
    .join(", ");
  return [
    "같은 프롬프트를 여러 모델에 동시 전송하여 응답을 비교합니다.",
    "코드 리뷰, 아키텍처 교차 검증, 중요한 기술 결정에 유용합니다.",
    "",
    `기본 대상: ${defaultLabels} (parallel_default ∩ enabled)`,
    "출력: === GPT [OK] === / === GLM [FAIL] === 형식으로 각 모델 응답 구분",
  ].join("\n");
}

function kindDescriptionNote(kind) {
  switch (kind) {
    case "openai-responses":
      return "OpenAI 호환 Responses API 직접 호출. 인증 체인: API 키 → codex CLI → ChatGPT OAuth(옵션).";
    case "openai-chat":
      return "OpenAI 호환 Chat Completions API 호출 (GLM/DeepSeek/Groq/OpenRouter/Ollama 등 전부 지원).";
    case "cli":
      return "공식 CLI 서브프로세스 실행 (execFile, shell 미사용).";
    default:
      return "";
  }
}

function buildAskToolDef(name, cfg) {
  const properties = {
    prompt: { type: "string", description: `${cfg.label}에게 전달할 작업 내용` },
    model: {
      type: "string",
      description: `사용할 ${cfg.label} 모델`,
      enum: cfg.models?.length ? cfg.models : [cfg.default_model],
      default: cfg.default_model,
    },
    system_prompt: { type: "string", description: "시스템 프롬프트 (선택사항)" },
    max_tokens: { type: "number", description: "최대 출력 토큰 수 (선택)" },
  };

  if (cfg.supports_reasoning_effort) {
    properties.reasoning_effort = {
      type: "string",
      description: "추론 강도 (기본값: medium)",
      enum: ["none", "low", "medium", "high", "xhigh"],
      default: "medium",
    };
  }
  if (cfg.supports_temperature) {
    properties.temperature = { type: "number", description: "온도 파라미터 0.0~2.0 (선택)" };
  }

  return {
    name: `ask_${name}`,
    description: [
      cfg.description ?? `${cfg.label}에게 작업을 위임합니다.`,
      "",
      `【호출 방식】 ${kindDescriptionNote(cfg.kind)}`,
    ].join("\n"),
    inputSchema: { type: "object", properties, required: ["prompt"] },
  };
}

function buildToolDefinitions(providers) {
  const tools = [];

  tools.push({
    name: "smart_route",
    description: buildSmartRouteDescription(providers),
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "수행할 작업 내용 (필수)" },
        category: {
          type: "string",
          description: "카테고리 명시 (선택, 생략 시 키워드로 자동 분류)",
          enum: Object.keys(providers.routing ?? {}),
        },
        context: { type: "string", description: "추가 컨텍스트 정보 (코드, 배경 등)" },
        max_tokens: { type: "number", description: "최대 출력 토큰 수 (선택)" },
      },
      required: ["task"],
    },
  });

  const enabledNames = getEnabledProviderNames(providers);
  tools.push({
    name: "ask_parallel",
    description: buildAskParallelDescription(providers),
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "모든 모델에게 전달할 프롬프트 (필수)" },
        models: {
          type: "array",
          items: { type: "string", enum: enabledNames },
          description: `사용할 모델 목록 (선택, 기본: parallel_default ∩ enabled)`,
        },
        system_prompt: { type: "string", description: "시스템 프롬프트 (선택)" },
        reasoning_effort: {
          type: "string",
          description: "GPT류 추론 강도 (기본값: medium)",
          enum: ["none", "low", "medium", "high", "xhigh"],
          default: "medium",
        },
      },
      required: ["prompt"],
    },
  });

  for (const [name, cfg] of Object.entries(providers.providers ?? {})) {
    if (!cfg.enabled) continue;
    tools.push(buildAskToolDef(name, cfg));
  }

  tools.push({
    name: "get_usage_stats",
    description: [
      "외부 모델(GLM/GPT) 토큰 사용량 통계를 조회합니다.",
      "모델별 호출 수, 입력/출력 토큰, 비율, 카테고리별 분류 현황을 보여줍니다.",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "조회할 기간 (일). 기본값: 7", default: 7 },
      },
    },
  });

  return tools;
}

// ───────────────────────────────────────────────
// --selftest — providers.json 로드 결과만 점검하고 종료 (sdk 임포트 없이 동작)
// ───────────────────────────────────────────────
async function buildAuthStatus(cfg) {
  const status = {};
  const authCfg = cfg.auth ?? {};

  if (cfg.kind === "cli") {
    status.command = Boolean(cfg.command?.length);
    return status;
  }

  if (cfg.kind === "openai-chat") {
    status.api_key = Boolean(getApiKeyForProvider(authCfg) || isLocalBaseUrl(cfg.base_url));
    return status;
  }

  // openai-responses 등 auth_priority 기반 인증
  const priority = authCfg.auth_priority?.length ? authCfg.auth_priority : ["api_key"];
  for (const method of priority) {
    if (method === "api_key") {
      status.api_key = Boolean(getApiKeyForProvider(authCfg));
    } else if (method === "codex_cli") {
      status.codex_cli = await checkCodexAvailable();
    } else if (method === "chatgpt_oauth") {
      const auth = readAuthJson();
      const tokens = auth?.tokens ?? auth ?? {};
      status.chatgpt_oauth = Boolean(authCfg.allow_chatgpt_oauth && tokens.access_token);
    }
  }
  return status;
}

async function runSelftest(providers) {
  const enabled = getEnabledProviderNames(providers);
  const authStatus = {};
  for (const [name, cfg] of Object.entries(providers.providers ?? {})) {
    authStatus[name] = await buildAuthStatus(cfg);
  }
  const tools = buildToolDefinitions(providers).map((t) => t.name);

  const output = {
    schema_version: providers.schema_version,
    enabled,
    auth_status: authStatus,
    tools,
    routing: providers.routing,
  };

  console.log(JSON.stringify(output, null, 2));
}

// ───────────────────────────────────────────────
// MCP 서버 정의 — sdk는 여기(main)에서만 동적 임포트
// ───────────────────────────────────────────────
async function main(providers) {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
    "@modelcontextprotocol/sdk/types.js"
  );

  const pkg = JSON.parse(readFileSync(join(SELF_DIR, "package.json"), "utf8"));

  const server = new Server(
    { name: "multi-model-agent", version: pkg.version },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildToolDefinitions(providers),
  }));

  // ── last-call.json 경로 (PostToolUse 훅이 읽음) ─────────────────────────────
  const LAST_CALL_PATH = join(homedir(), "mcp-servers", "multi-model", "last-call.json");

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const callStart = Date.now();
    let result;
    let callMeta = { tool: name, status: "ok" };

    try {
      if (name === "smart_route") {
        result = await callSmartRoute(
          providers,
          args.task,
          args.category ?? null,
          args.context ?? null,
          args.max_tokens ?? null
        );
      } else if (name === "ask_parallel") {
        result = await callAskParallel(
          providers,
          args.prompt,
          args.models ?? null,
          args.system_prompt ?? null,
          args.reasoning_effort ?? "medium"
        );
      } else if (name === "get_usage_stats") {
        result = getUsageStats(args?.days ?? 7);
      } else if (name.startsWith("ask_")) {
        const providerName = name.slice(4);
        const cfg = providers.providers[providerName];
        if (!cfg || !cfg.enabled) {
          throw new Error(`알 수 없거나 비활성화된 프로바이더: ${providerName}`);
        }
        result = await callProvider(cfg, {
          prompt: args.prompt,
          model: args.model ?? cfg.default_model,
          systemPrompt: args.system_prompt ?? null,
          reasoningEffort: args.reasoning_effort ?? "medium",
          maxTokens: args.max_tokens ?? null,
          temperature: args.temperature ?? null,
          logExtra: {},
        });
      } else {
        result = `알 수 없는 툴: ${name}`;
      }
    } catch (err) {
      callMeta.status = "error";
      callMeta.error  = err.message;
      result = `[오류] ${err.message}`;
    }

    // ── 메타데이터 기록 (PostToolUse 훅용, 동적 프로바이더에 맞게 일반화) ───────────
    callMeta.elapsed_ms = Date.now() - callStart;
    callMeta.timestamp  = new Date().toISOString();

    if (name === "smart_route" && typeof result === "string") {
      const m = result.match(/^\[smart_route: (\w+) → (\w+)/);
      if (m) {
        const [, cat, providerName] = m;
        callMeta.category = cat;
        callMeta.model   = providers.providers[providerName]?.default_model ?? providerName;
        callMeta.routing = "smart_route→" + providerName;
      }
    } else if (name === "ask_parallel") {
      callMeta.model            = "parallel";
      callMeta.models           = args?.models ?? providers.parallel_default;
      callMeta.reasoning_effort = args?.reasoning_effort ?? "medium";
    } else if (name.startsWith("ask_")) {
      const providerName = name.slice(4);
      const cfg = providers.providers[providerName];
      callMeta.model = args?.model ?? cfg?.default_model;
      if (cfg?.supports_reasoning_effort) {
        callMeta.reasoning_effort = args?.reasoning_effort ?? "medium";
      }
    }

    // 비동기 쓰기: 이벤트 루프 block 없이 훅용 메타데이터 기록
    writeFile(LAST_CALL_PATH, JSON.stringify(callMeta)).catch(() => {});

    return { content: [{ type: "text", text: result }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ───────────────────────────────────────────────
// 엔트리포인트
// ───────────────────────────────────────────────
const providers = loadProviders();

if (process.argv.includes("--selftest")) {
  await runSelftest(providers);
} else {
  await main(providers);
}
