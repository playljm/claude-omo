#!/usr/bin/env node
/**
 * Multi-Model MCP Server v4.0
 *
 * 연결 모델:
 *   - GPT-5.3-Codex  : ChatGPT OAuth (~/.codex/auth.json) → Responses API /v1/responses
 *   - Gemini 2.5 Pro : AI Studio API Key → OpenAI 호환 엔드포인트
 *   - GLM-4.7-Flash  : Z.ai API Key     → OpenAI 호환 엔드포인트
 *
 * v4.0 신규:
 *   - fetchWithRetry: 429/500/502/503/529 → 최대 3회 재시도, 지수 백오프
 *   - smart_route   : 카테고리 기반 자동 라우팅 + 폴백 체인
 *   - ask_parallel  : Promise.allSettled() 다중 모델 동시 호출
 *   - 확장 파라미터 : max_tokens, temperature (Gemini/GLM), max_tokens (GPT)
 *   - 강화 로깅     : category, retry_count, routing 필드 추가
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

// ───────────────────────────────────────────────
// 토큰 사용량 로깅
// ───────────────────────────────────────────────
const USAGE_LOG_PATH = join(homedir(), "mcp-servers", "multi-model", "usage-log.jsonl");
const LAST_ROUTE_PATH = join(homedir(), "mcp-servers", "multi-model", "last-route.json");

// 카테고리별 한국어 이유 설명
const CATEGORY_REASON = {
  ultrabrain: "전체 아키텍처 설계 · 종합 전략 결정",
  deep:       "알고리즘 분석 · 복잡한 디버깅 · 리팩토링",
  visual:     "UI/UX · React/Vue · 프론트엔드 작업",
  research:   "코드베이스 전체 분석 · 대용량 파일",
  bulk:       "보일러플레이트 · CRUD · 반복 패턴 생성",
  writing:    "문서 작성 · README · 주석 추가",
  quick:      "단순 변환 · 포맷팅 · 즉각 처리",
};

// 모델 표시명
const MODEL_DISPLAY = {
  gpt:    "GPT-5.3-Codex",
  gemini: "Gemini 2.5 Pro",
  glm:    "GLM-4.7-Flash",
};

function logUsage(model, inputTokens, outputTokens, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    ...extra, // category, retry_count, routing, reasoning_effort 등
  };
  try {
    mkdirSync(dirname(USAGE_LOG_PATH), { recursive: true });
    appendFileSync(USAGE_LOG_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // 로깅 실패해도 메인 기능에 영향 없음
  }
}

// 라우팅 트레이스를 last-route.json에 저장 (routing-display.js 훅이 읽음)
function saveRoutingTrace(trace) {
  try {
    mkdirSync(dirname(LAST_ROUTE_PATH), { recursive: true });
    writeFileSync(LAST_ROUTE_PATH, JSON.stringify({ ...trace, timestamp: new Date().toISOString() }));
  } catch {
    // 저장 실패해도 무시
  }
}

// 응답에 포함될 라우팅 헤더 (유니코드 박스 아트, ANSI 없음)
function formatRoutingHeader({ cat, model, effort = null, didFallback = false, fallbackFrom = null }) {
  const modelName = MODEL_DISPLAY[model] ?? model;
  const effortStr = effort && effort !== "none" ? ` · reasoning: ${effort}` : "";
  const reason = CATEGORY_REASON[cat] ?? cat;
  const lines = [
    `╭─ 🔀 ROUTING ──────────────────────────────────`,
    `│  카테고리 : ${cat}`,
    `│  모    델 : ${modelName}${effortStr}`,
    `│  이    유 : ${reason}`,
  ];
  if (didFallback && fallbackFrom) {
    lines.push(`│  ⚠ 폴백  : ${MODEL_DISPLAY[fallbackFrom] ?? fallbackFrom} 실패 → ${modelName}`);
  }
  lines.push(`╰──────────────────────────────────────────────`);
  return lines.join("\n");
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

async function fetchWithRetry(url, options, maxRetries = 3) {
  let retryCount = 0;
  while (true) {
    const res = await fetch(url, options);
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
// GPT OAuth 토큰 관리
// auth.json 구조: { tokens: { access_token, refresh_token }, OPENAI_API_KEY, last_refresh }
// 우선순위: 1) OPENAI_API_KEY 환경변수  2) auth.json의 OPENAI_API_KEY  3) ChatGPT OAuth
// ───────────────────────────────────────────────
const CODEX_AUTH_PATH = join(homedir(), ".codex", "auth.json");
const TOKEN_REFRESH_URL = "https://auth.openai.com/oauth/token";

let refreshPromise = null;

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

// ChatGPT JWT에서 https://api.openai.com/auth 클레임 추출 (account_id 등)
function getJwtAuthClaim(token) {
  try {
    const payload = token.split(".")[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return decoded["https://api.openai.com/auth"] ?? null;
  } catch {
    return null;
  }
}

const SCOPE_RE_LOGIN_MSG =
  "Windows에서 `codex login` 실행 후 auth.json을 이 서버로 복사하세요:\n" +
  "  scp ~/.codex/auth.json root@<서버IP>:~/.codex/auth.json\n" +
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

async function getValidAccessToken() {
  // ── 1순위: OPENAI_API_KEY 환경변수 ──────────────────────────
  if (process.env.OPENAI_API_KEY) {
    return { token: process.env.OPENAI_API_KEY, isOAuthOnly: false };
  }

  // ── 2순위: auth.json의 OPENAI_API_KEY ───────────────────────
  const auth = readAuthJson();
  if (auth?.OPENAI_API_KEY) {
    return { token: auth.OPENAI_API_KEY, isOAuthOnly: false };
  }

  // ── 3순위: ChatGPT OAuth access_token ───────────────────────
  if (!auth) {
    throw new Error(
      "GPT 인증 없음. 다음 중 하나를 설정하세요:\n" +
      "  방법 1) OPENAI_API_KEY 환경변수 설정 (platform.openai.com에서 발급)\n" +
      "  방법 2) ~/.codex/auth.json의 OPENAI_API_KEY 필드에 sk-... 키 입력\n" +
      "  방법 3) codex login 으로 ChatGPT OAuth 인증 (api.responses.write 스코프 필요)"
    );
  }

  const tokens = auth.tokens ?? auth;
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;

  if (!accessToken) {
    throw new Error("access_token이 없습니다. `codex login`으로 재인증이 필요합니다.");
  }

  const { exp: expiry, scopes, clientId } = getJwtInfo(accessToken);
  // OAuth 전용(api.responses.write 스코프 없음) 시 Chat Completions API 폴백 사용
  const isOAuthOnly = !scopes.includes("api.responses.write");
  const isExpired = expiry > 0 && Date.now() / 1000 > expiry - 60;
  if (!isExpired) return { token: accessToken, isOAuthOnly };
  if (!refreshToken) {
    throw new Error(
      "토큰이 만료되었고 refresh_token이 없습니다. `codex login`으로 재인증하세요."
    );
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
        const refreshedIsOAuthOnly = !newScopes.includes("api.responses.write");
        return { token: refreshed.access_token, isOAuthOnly: refreshedIsOAuthOnly };
      })
      .finally(() => { refreshPromise = null; });
  }

  try {
    return await refreshPromise;
  } catch (e) {
    throw new Error(`액세스 토큰 갱신 실패: ${e.message}`);
  }
}

// ───────────────────────────────────────────────
// callGpt — Responses API
// ───────────────────────────────────────────────
async function callGpt(
  prompt,
  model = "gpt-5.3-codex",
  systemPrompt = null,
  reasoningEffort = "medium",
  maxTokens = null,
  logExtra = {}
) {
  const { token, isOAuthOnly } = await getValidAccessToken();

  // OAuth 전용 토큰: chatgpt.com/backend-api/codex/responses 사용
  // (api.responses.write 스코프 없는 ChatGPT Plus/Pro OAuth 토큰용)
  if (isOAuthOnly) {
    const authClaim = getJwtAuthClaim(token);
    const accountId = authClaim?.chatgpt_account_id;
    if (!accountId) {
      throw new Error(
        "ChatGPT account_id를 JWT에서 추출할 수 없습니다. `codex login`으로 재인증하세요."
      );
    }

    const instructions = systemPrompt || "You are a helpful coding assistant.";
    const codexBody = {
      model, instructions, store: false, stream: true,
      input: [{ role: "user", content: prompt }],
    };
    if (reasoningEffort !== "none") codexBody.reasoning = { effort: reasoningEffort };
    if (maxTokens) codexBody.max_output_tokens = maxTokens;

    const { res: codexRes, retryCount: codexRetry } = await fetchWithRetry(
      "https://chatgpt.com/backend-api/codex/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "chatgpt-account-id": accountId,
          "OpenAI-Beta": "responses=experimental",
          originator: "codex_cli_rs",
        },
        body: JSON.stringify(codexBody),
      }
    );

    if (!codexRes.ok) {
      const errText = await codexRes.text();
      throw new Error(
        `GPT Codex backend 오류 (HTTP ${codexRes.status}): ${errText.substring(0, 300)}\n` +
        `※ 이 오류가 계속되면 OPENAI_API_KEY를 platform.openai.com에서 발급하세요.`
      );
    }

    // SSE → 텍스트 파싱
    const sseText = await codexRes.text();
    const sseLines = sseText.split("\n");
    let completedResponse = null;
    for (let i = 0; i < sseLines.length; i++) {
      if (sseLines[i].startsWith("event: response.completed")) {
        const dataLine = sseLines[i + 1];
        if (dataLine?.startsWith("data: ")) {
          try { completedResponse = JSON.parse(dataLine.slice(6)); } catch { /* skip */ }
        }
      }
    }

    if (completedResponse) {
      const usage = completedResponse.response?.usage ?? {};
      logUsage(model, usage.input_tokens ?? 0, usage.output_tokens ?? 0, {
        retry_count: codexRetry, routing: "chatgpt_codex_backend", ...logExtra,
      });
      const texts = [];
      for (const item of completedResponse.response?.output ?? []) {
        if (item.type === "message") {
          for (const block of item.content ?? []) {
            if (block.type === "output_text" && block.text) texts.push(block.text);
          }
        }
      }
      if (texts.length > 0) return texts.join("\n");
    }

    // fallback: delta 조합
    const deltas = [];
    for (let i = 0; i < sseLines.length; i++) {
      if (sseLines[i].startsWith("event: response.output_text.delta")) {
        const dataLine = sseLines[i + 1];
        if (dataLine?.startsWith("data: ")) {
          try { const d = JSON.parse(dataLine.slice(6)); if (d.delta) deltas.push(d.delta); } catch { /* skip */ }
        }
      }
    }
    if (deltas.length > 0) return deltas.join("");
    return "[GPT Codex backend: 응답 파싱 실패]";
  }

  const input = [];
  // Responses API (정상 경로)
  if (systemPrompt) input.push({ role: "system", content: systemPrompt });
  input.push({ role: "user", content: prompt });
  const body = { model, input };
  if (reasoningEffort !== "none") body.reasoning = { effort: reasoningEffort };
  if (maxTokens) body.max_output_tokens = maxTokens;
  const { res, retryCount } = await fetchWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT API 오류 (HTTP ${res.status}): ${err}`);
  }
  const data = await res.json();
  const usage = data.usage ?? {};
  logUsage(model, usage.input_tokens ?? 0, usage.output_tokens ?? 0, {
    reasoning_tokens: usage.reasoning_tokens ?? 0,
    reasoning_effort: reasoningEffort,
    retry_count: retryCount,
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
// callGemini — OpenAI 호환 Chat Completions
// ───────────────────────────────────────────────
async function callGemini(
  prompt,
  model = "gemini-2.5-pro",
  systemPrompt = null,
  maxTokens = null,
  temperature = null,
  logExtra = {}
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY 환경변수 없음. ~/.bashrc에 export GEMINI_API_KEY='키값' 추가 후 터미널 재시작."
    );
  }

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const body = { model, messages, max_tokens: maxTokens ?? 8192 };
  if (temperature !== null) body.temperature = temperature;

  const { res, retryCount } = await fetchWithRetry(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 오류 (HTTP ${res.status}): ${err}`);
  }

  const data = await res.json();
  const usage = data.usage ?? {};
  logUsage(model, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0, {
    retry_count: retryCount,
    ...logExtra,
  });

  return data.choices?.[0]?.message?.content ?? "응답 없음";
}

// ───────────────────────────────────────────────
// callGlm — OpenAI 호환 Chat Completions (Z.ai)
// ───────────────────────────────────────────────
async function callGlm(
  prompt,
  model = "glm-4.7-flash",
  systemPrompt = null,
  maxTokens = null,
  temperature = null,
  logExtra = {}
) {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GLM_API_KEY 환경변수 없음. api.z.ai에서 키 발급 후 ~/.bashrc에 추가."
    );
  }

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const body = { model, messages, max_tokens: maxTokens ?? 4096 };
  if (temperature !== null) body.temperature = temperature;

  const { res, retryCount } = await fetchWithRetry(
    "https://api.z.ai/api/paas/v4/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GLM API 오류 (HTTP ${res.status}): ${err}`);
  }

  const data = await res.json();
  const usage = data.usage ?? {};
  logUsage(model, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0, {
    retry_count: retryCount,
    ...logExtra,
  });

  return data.choices?.[0]?.message?.content ?? "응답 없음";
}

// ───────────────────────────────────────────────
// smart_route — 카테고리 기반 자동 라우팅
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

// 카테고리 → 라우팅 설정
// fallbackEffort: 폴백 모델이 GPT일 때 사용할 reasoning_effort
const CATEGORY_ROUTING = {
  ultrabrain: { model: "gpt",    effort: "xhigh", fallback: ["gemini"], fallbackEffort: "high"   },
  deep:       { model: "gpt",    effort: "high",  fallback: ["gemini"], fallbackEffort: null      },
  visual:     { model: "gemini", effort: null,     fallback: ["gpt"],    fallbackEffort: "high"   },
  research:   { model: "gemini", effort: null,     fallback: ["gpt"],    fallbackEffort: "high"   },
  bulk:       { model: "glm",    effort: null,     fallback: ["gemini"], fallbackEffort: null      },
  writing:    { model: "glm",    effort: null,     fallback: ["gemini"], fallbackEffort: null      },
  quick:      { model: "gpt",    effort: "none",   fallback: ["glm"],    fallbackEffort: null      },
};

function classifyCategory(task) {
  for (const [cat, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(task)) return cat;
  }
  return null; // 분류 불가 → 호출자가 기본값 결정
}

async function callSmartRoute(task, category = null, context = null, maxTokens = null) {
  const cat = category ?? classifyCategory(task) ?? "deep";
  const routing = CATEGORY_ROUTING[cat] ?? CATEGORY_ROUTING.deep;
  const fullPrompt = context ? `[컨텍스트]\n${context}\n\n[작업]\n${task}` : task;
  const primaryModel = routing.model;

  async function tryModel(model, effort, logExtra) {
    switch (model) {
      case "gpt":
        return callGpt(fullPrompt, "gpt-5.3-codex", null, effort ?? "medium", maxTokens, logExtra);
      case "gemini":
        return callGemini(fullPrompt, "gemini-2.5-pro", null, maxTokens, null, logExtra);
      case "glm":
        return callGlm(fullPrompt, "glm-4.7-flash", null, maxTokens, null, logExtra);
      default:
        throw new Error(`알 수 없는 모델: ${model}`);
    }
  }

  // Primary 시도
  try {
    const result = await tryModel(primaryModel, routing.effort, {
      category: cat,
      routing: `smart_route→${primaryModel}`,
    });
    saveRoutingTrace({
      tool: "smart_route",
      category: cat,
      model: primaryModel,
      effort: routing.effort,
      reason: CATEGORY_REASON[cat] ?? cat,
      didFallback: false,
    });
    return result;
  } catch (primaryErr) {
    // Fallback 체인
    for (const fbModel of routing.fallback) {
      try {
        const result = await tryModel(fbModel, routing.fallbackEffort, {
          category: cat,
          routing: `smart_route→${primaryModel}(fail)→${fbModel}`,
        });
        saveRoutingTrace({
          tool: "smart_route",
          category: cat,
          model: fbModel,
          effort: routing.fallbackEffort,
          reason: CATEGORY_REASON[cat] ?? cat,
          didFallback: true,
          fallbackFrom: primaryModel,
        });
        return result;
      } catch {
        // 다음 폴백으로 계속
      }
    }
    throw new Error(`smart_route 전체 실패 — 모든 폴백 소진 (1차 오류: ${primaryErr.message})`);
  }
}

// ───────────────────────────────────────────────
// ask_parallel — Promise.allSettled() 다중 모델 동시 호출
// ───────────────────────────────────────────────
async function callAskParallel(prompt, models = null, systemPrompt = null) {
  const ALL_MODELS = ["gpt", "gemini", "glm"];
  const selectedModels = (models ?? ALL_MODELS).filter((m) => ALL_MODELS.includes(m));
  if (selectedModels.length === 0) selectedModels.push(...ALL_MODELS);

  const logExtra = { routing: "ask_parallel" };

  const modelCalls = {
    gpt:    () => callGpt(prompt, "gpt-5.3-codex", systemPrompt, "medium", null, logExtra),
    gemini: () => callGemini(prompt, "gemini-2.5-pro", systemPrompt, null, null, logExtra),
    glm:    () => callGlm(prompt, "glm-4.7-flash", systemPrompt, null, null, logExtra),
  };

  const results = await Promise.allSettled(selectedModels.map((m) => modelCalls[m]()));

  return results
    .map((r, i) => {
      const label = selectedModels[i].toUpperCase();
      return r.status === "fulfilled"
        ? `=== ${label} [OK] ===\n${r.value}`
        : `=== ${label} [FAIL] ===\n${r.reason?.message ?? "알 수 없는 오류"}`;
    })
    .join("\n\n");
}

// ───────────────────────────────────────────────
// MCP 서버 정의
// ───────────────────────────────────────────────
const server = new Server(
  { name: "multi-model-agent", version: "4.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ─── smart_route ────────────────────────────
    {
      name: "smart_route",
      description: [
        "작업을 카테고리로 분류하여 최적 모델에 자동 라우팅합니다. (OMO 스타일)",
        "",
        "【카테고리 → 모델 매핑】",
        "- ultrabrain : GPT(xhigh) — 전체 아키텍처 설계, 종합 전략",
        "- deep       : GPT(high)  — 알고리즘, 복잡한 디버깅, 리팩토링",
        "- visual     : Gemini     — UI/UX, React/Vue, 프론트엔드",
        "- research   : Gemini     — 코드베이스 전체 분석, 대규모 파일",
        "- bulk       : GLM        — 보일러플레이트, CRUD, 반복 패턴",
        "- writing    : GLM        — 문서, README, 주석 추가",
        "- quick      : GPT(none)  — 단순 변환, 포맷팅",
        "",
        "【폴백 체인】 primary 실패 시 자동 폴백",
        "- ultrabrain/deep → GPT → Gemini",
        "- visual/research → Gemini → GPT",
        "- bulk/writing    → GLM → Gemini",
        "- quick           → GPT → GLM",
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string", description: "수행할 작업 내용 (필수)" },
          category: {
            type: "string",
            description: "카테고리 명시 (선택, 생략 시 키워드로 자동 분류)",
            enum: ["ultrabrain", "deep", "visual", "research", "bulk", "writing", "quick"],
          },
          context: { type: "string", description: "추가 컨텍스트 정보 (코드, 배경 등)" },
          max_tokens: { type: "number", description: "최대 출력 토큰 수 (선택)" },
        },
        required: ["task"],
      },
    },

    // ─── ask_parallel ────────────────────────────
    {
      name: "ask_parallel",
      description: [
        "같은 프롬프트를 여러 모델에 동시 전송하여 응답을 비교합니다.",
        "코드 리뷰, 아키텍처 교차 검증, 중요한 기술 결정에 유용합니다.",
        "",
        "출력: === GPT [OK] === / === GEMINI [FAIL] === 형식으로 각 모델 응답 구분",
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "모든 모델에게 전달할 프롬프트 (필수)" },
          models: {
            type: "array",
            items: { type: "string", enum: ["gpt", "gemini", "glm"] },
            description: "사용할 모델 목록 (선택, 기본: 전체 [gpt, gemini, glm])",
          },
          system_prompt: { type: "string", description: "시스템 프롬프트 (선택)" },
        },
        required: ["prompt"],
      },
    },

    // ─── ask_gpt ─────────────────────────────────
    {
      name: "ask_gpt",
      description: [
        "GPT-5.3-Codex에게 작업을 위임합니다 (ChatGPT Plus OAuth 인증).",
        "내부적으로 OpenAI Responses API(/v1/responses)를 사용합니다.",
        "사전 조건: `codex login` 완료 후 ~/.codex/auth.json 존재 필요.",
        "",
        "【이 툴이 적합한 작업】",
        "- 복잡한 코드 리뷰 및 개선 제안",
        "- 창의적 글쓰기, 영어 기술 문서 작성",
        "- 복잡한 알고리즘 설계 및 아키텍처 브레인스토밍",
        "- 멀티스텝 추론이 필요한 디버깅",
        "",
        "【reasoning_effort 가이드】",
        "- none  : reasoning 토큰 없음 (포맷팅, 단순 변환 — 최저 비용)",
        "- low   : 빠른 응답 (간단한 질문)",
        "- medium: 기본값, 대부분의 작업",
        "- high  : 복잡한 알고리즘, 깊은 코드 분석",
        "- xhigh : 장시간 아키텍처 설계, 전체 코드베이스 리팩토링",
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "GPT에게 전달할 작업 내용" },
          model: {
            type: "string",
            description: "사용할 GPT 모델",
            enum: ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-max"],
            default: "gpt-5.3-codex",
          },
          reasoning_effort: {
            type: "string",
            description: "추론 강도 (기본값: medium)",
            enum: ["none", "low", "medium", "high", "xhigh"],
            default: "medium",
          },
          system_prompt: { type: "string", description: "시스템 프롬프트 (선택사항)" },
          max_tokens: { type: "number", description: "최대 출력 토큰 수 (max_output_tokens로 매핑)" },
        },
        required: ["prompt"],
      },
    },

    // ─── ask_gemini ───────────────────────────────
    {
      name: "ask_gemini",
      description: [
        "Gemini 2.5 Pro에게 작업을 위임합니다 (AI Studio API Key).",
        "",
        "【핵심 강점 - 이 상황에서 반드시 사용할 것】",
        "- 200줄 이상 파일/코드베이스 전체 분석 (1M 토큰 컨텍스트)",
        "- 여러 파일을 한 번에 넘겨 전체 구조 파악",
        "- React/Vue/Tailwind UI 컴포넌트 및 화면 설계",
        "- 긴 문서 요약 및 비교 분석",
        "",
        "【Sonnet 대신 이 툴을 쓸 것】",
        "파일이 길거나, 여러 파일을 동시에 분석해야 할 때.",
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Gemini에게 전달할 작업 내용" },
          model: {
            type: "string",
            description: "사용할 Gemini 모델",
            default: "gemini-2.5-pro",
          },
          system_prompt: { type: "string", description: "시스템 프롬프트 (선택사항)" },
          max_tokens: { type: "number", description: "최대 출력 토큰 수 (기본값: 8192)" },
          temperature: { type: "number", description: "온도 파라미터 0.0~2.0 (선택)" },
        },
        required: ["prompt"],
      },
    },

    // ─── ask_glm ──────────────────────────────────
    {
      name: "ask_glm",
      description: [
        "GLM-4.7-Flash(Z.ai)에게 작업을 위임합니다. 비용 효율 최우선.",
        "",
        "【반드시 이 툴을 먼저 고려할 상황】",
        "- 보일러플레이트 코드 (CRUD, 마이그레이션, 시드 파일)",
        "- 반복 패턴 파일 생성 (라우터, 컨트롤러, 모델 2개 이상)",
        "- 포맷 변환 (JSON↔CSV, SQL 스키마 변환)",
        "- 주석 추가, 코드 정리, 단순 리팩토링",
        "- 빠른 초안 작성 (이후 Sonnet이 다듬는 용도)",
        "",
        "【성능】 SWE-bench Verified 77.8% (오픈소스 1위)",
        "【비용】 Sonnet 4.6 대비 약 5~8배 저렴",
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "GLM-4.7-Flash에게 전달할 작업 내용" },
          model: {
            type: "string",
            description: "사용할 GLM 모델",
            default: "glm-4.7-flash",
          },
          system_prompt: { type: "string", description: "시스템 프롬프트 (선택사항)" },
          max_tokens: { type: "number", description: "최대 출력 토큰 수 (기본값: 4096)" },
          temperature: { type: "number", description: "온도 파라미터 0.0~2.0 (선택)" },
        },
        required: ["prompt"],
      },
    },

    // ─── get_usage_stats ──────────────────────────
    {
      name: "get_usage_stats",
      description: [
        "외부 모델(GLM/Gemini/GPT) 토큰 사용량 통계를 조회합니다.",
        "모델별 호출 수, 입력/출력 토큰, 비율, 카테고리별 분류 현황을 보여줍니다.",
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "조회할 기간 (일). 기본값: 7",
            default: 7,
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  try {
    switch (name) {
      case "smart_route":
        result = await callSmartRoute(
          args.task,
          args.category ?? null,
          args.context ?? null,
          args.max_tokens ?? null
        );
        break;

      case "ask_parallel":
        result = await callAskParallel(
          args.prompt,
          args.models ?? null,
          args.system_prompt ?? null
        );
        saveRoutingTrace({
          tool: "ask_parallel",
          model: "parallel",
          models: args.models ?? ["gpt", "gemini", "glm"],
        });
        break;

      case "ask_gpt":
        result = await callGpt(
          args.prompt,
          args.model ?? "gpt-5.3-codex",
          args.system_prompt ?? null,
          args.reasoning_effort ?? "medium",
          args.max_tokens ?? null
        );
        saveRoutingTrace({ tool: "ask_gpt", model: "gpt", effort: args.reasoning_effort ?? "medium" });
        break;

      case "ask_gemini":
        result = await callGemini(
          args.prompt,
          args.model ?? "gemini-2.5-pro",
          args.system_prompt ?? null,
          args.max_tokens ?? null,
          args.temperature ?? null
        );
        saveRoutingTrace({ tool: "ask_gemini", model: "gemini" });
        break;

      case "ask_glm":
        result = await callGlm(
          args.prompt,
          args.model ?? "glm-4.7-flash",
          args.system_prompt ?? null,
          args.max_tokens ?? null,
          args.temperature ?? null
        );
        saveRoutingTrace({ tool: "ask_glm", model: "glm" });
        break;

      case "get_usage_stats":
        result = getUsageStats(args?.days ?? 7);
        break;

      default:
        result = `알 수 없는 툴: ${name}`;
    }
  } catch (err) {
    result = `[오류] ${err.message}`;
  }

  return { content: [{ type: "text", text: result }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
