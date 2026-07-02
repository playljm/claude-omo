#!/usr/bin/env node
/**
 * Post-Call Logger Hook — PostToolUse
 * v5.3: MCP 모델 도구 호출 완료 후 결과 요약 출력 + activity.log 기록
 *
 * 효과:
 *   - "✅ GPT-5.3-Codex [deep] — 34.5s" 즉시 표시
 *   - ~/mcp-servers/multi-model/activity.log 에 구조화된 로그 기록
 * 등록: settings.json PostToolUse — matcher: "mcp__multi-model-agent"
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const BASE           = join(homedir(), "mcp-servers", "multi-model");
const LAST_CALL_PATH = join(BASE, "last-call.json");
const ACTIVITY_LOG   = join(BASE, "activity.log");
const PRE_CALL_STATE = join(BASE, "pre-call-state.json");
const MAX_AGE_MS = 60000; // 60초 지난 엔트리는 청소 (레이스로 남은 고아 엔트리 방지)

// ── djb2 해시 (tool_input 식별용 — pre-call-indicator.js와 동일 구현 유지) ──
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

// ── stdin 읽기 ─────────────────────────────────────────────────────
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString("utf8").trim();
if (!raw) process.exit(0);

let input;
try { input = JSON.parse(raw); } catch { process.exit(0); }

const toolName = input?.tool_name ?? input?.tool ?? input?.tool_use?.name ?? "";
if (!toolName.includes("multi-model-agent")) process.exit(0);

const tool = toolName.split("__").pop();
if (tool === "get_usage_stats") process.exit(0);

const toolInput = input?.tool_input ?? input?.input ?? input?.tool_use?.input ?? {};

// ── last-call.json 읽기 (index.js가 작성) ──────────────────────────
let meta = {};
if (existsSync(LAST_CALL_PATH)) {
  try { meta = JSON.parse(readFileSync(LAST_CALL_PATH, "utf8")); } catch {}
  // 30초 이내 기록만 신뢰 (xhigh reasoning은 훅 딜레이가 클 수 있음)
  if (meta.timestamp && Date.now() - new Date(meta.timestamp).getTime() > 30000) meta = {};
}

// ── wall-clock elapsed 계산 ────────────────────────────────────────
// 자기 키(tool:hash)만 매칭해서 제거 — 동시 호출 시 다른 호출의 엔트리를 오염시키지 않음
let wallElapsedMs = meta.elapsed_ms ?? 0;
const key = `${tool}:${djb2(JSON.stringify(toolInput))}`;
const state = readState();
if (state[key]) {
  wallElapsedMs = Date.now() - state[key].ts;
  delete state[key];
  try { writeFileSync(PRE_CALL_STATE, JSON.stringify(state)); } catch {}
}
// 매칭 실패 시 elapsed는 meta.elapsed_ms(서버 측 값)를 그대로 사용

// ── 활동 로그 기록 (JSONL) ─────────────────────────────────────────
const entry = {
  ts:          new Date().toISOString(),
  tool,
  model:       meta.model        ?? "unknown",
  category:    meta.category     ?? null,
  elapsed_ms:  wallElapsedMs,
  srv_ms:      meta.elapsed_ms   ?? null,
  status:      meta.status       ?? "ok",
  routing:     meta.routing      ?? null,
  effort:      meta.reasoning_effort ?? null,
  models:      meta.models       ?? null,  // ask_parallel용
};
try { appendFileSync(ACTIVITY_LOG, JSON.stringify(entry) + "\n"); } catch {}

// ── 터미널 출력 없음 — routing-display.js가 시각 출력 담당 ──────────
// activity.log 기록만 수행 (위에서 완료)
