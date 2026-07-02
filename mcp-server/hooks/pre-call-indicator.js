#!/usr/bin/env node
/**
 * Pre-Call Indicator Hook — PreToolUse
 * v5.3: MCP 모델 도구 호출 시작 직전에 즉각적인 시각 피드백 제공
 *
 * 효과: 10~90초 무음 대기 → "⏳ GPT 호출 중..." 즉시 표시
 * 등록: settings.json PreToolUse — matcher: "mcp__multi-model-agent"
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PRE_CALL_STATE = join(homedir(), "mcp-servers", "multi-model", "pre-call-state.json");
const MAX_AGE_MS = 60000; // 60초 지난 엔트리는 청소 (레이스로 남은 고아 엔트리 방지)

// ── djb2 해시 (tool_input 식별용 — post-call-logger.js와 동일 구현 유지) ──
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

// ── 상태 맵 읽기 + 오래된 엔트리 청소 ──────────────────────────────
function readState() {
  if (!existsSync(PRE_CALL_STATE)) return {};
  let map;
  try { map = JSON.parse(readFileSync(PRE_CALL_STATE, "utf8")); } catch { return {}; }
  if (!map || typeof map !== "object") return {};
  const now = Date.now();
  for (const key of Object.keys(map)) {
    if (!map[key]?.ts || now - map[key].ts > MAX_AGE_MS) delete map[key];
  }
  return map;
}

// ── stdin 읽기 (for await 패턴) ────────────────────────────────────
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString("utf8").trim();
if (!raw) process.exit(0);

let input;
try { input = JSON.parse(raw); } catch { process.exit(0); }

// ── 도구명 추출 ────────────────────────────────────────────────────
const toolName = input?.tool_name ?? input?.tool ?? input?.tool_use?.name ?? "";
if (!toolName.includes("multi-model-agent")) process.exit(0);

const tool = toolName.split("__").pop();
if (tool === "get_usage_stats") process.exit(0);

const toolInput = input?.tool_input ?? input?.input ?? input?.tool_use?.input ?? {};

// ── 모델/도구 메타데이터 ───────────────────────────────────────────
const TOOL_META = {
  ask_gpt:      { icon: "🧠", short: "GPT-5.3-Codex" },
  ask_glm:      { icon: "⚡", short: "GLM-5"          },
  smart_route:  { icon: "🔀", short: "smart_route"    },
  ask_parallel: { icon: "🔀", short: "All Models"     },
};

const meta = TOOL_META[tool] ?? { icon: "🤖", short: tool };

const cat    = toolInput.category ?? null;
const effort = toolInput.reasoning_effort ?? null;
const model  = toolInput.model ?? null;

// ── 시작 타임스탬프 저장 (PostToolUse에서 elapsed 계산용) ──────────
// 단일 오브젝트가 아닌 { [tool:hash]: entry } 맵으로 저장 — 동시 호출 레이스 완화
const key = `${tool}:${djb2(JSON.stringify(toolInput))}`;
const state = readState();
state[key] = {
  ts: Date.now(),
  tool,
  model: model ?? meta.short,
  icon: meta.icon,
  category: cat,
};
try { writeFileSync(PRE_CALL_STATE, JSON.stringify(state)); } catch {}

// ── 출력 (1~2줄 이내 — truncation 방지) ──────────────────────────
const parts = [`${meta.icon} ${meta.short}`];
if (cat) parts.push(`[${cat}]`);
if (effort && effort !== "none") parts.push(`reasoning:${effort}`);

const time = new Date().toLocaleTimeString("ko-KR", { hour12: false });
// stderr 사용: stdout은 PreToolUse 훅에서 Claude 컨텍스트에 주입됨
process.stderr.write(`⏳ ${parts.join(" ")} — ${time} 호출 시작\n`);
