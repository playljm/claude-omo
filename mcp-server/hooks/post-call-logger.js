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

import { readFileSync, appendFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const BASE           = join(homedir(), "mcp-servers", "multi-model");
const LAST_CALL_PATH = join(BASE, "last-call.json");
const ACTIVITY_LOG   = join(BASE, "activity.log");
const PRE_CALL_STATE = join(BASE, "pre-call-state.json");

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

// ── last-call.json 읽기 (index.js가 작성) ──────────────────────────
let meta = {};
if (existsSync(LAST_CALL_PATH)) {
  try { meta = JSON.parse(readFileSync(LAST_CALL_PATH, "utf8")); } catch {}
  // 10초 이내 기록만 신뢰
  if (meta.timestamp && Date.now() - new Date(meta.timestamp).getTime() > 10000) meta = {};
}

// ── wall-clock elapsed 계산 ────────────────────────────────────────
let wallElapsedMs = meta.elapsed_ms ?? 0;
if (existsSync(PRE_CALL_STATE)) {
  try {
    const pre = JSON.parse(readFileSync(PRE_CALL_STATE, "utf8"));
    if (pre.start) wallElapsedMs = Date.now() - pre.start;
  } catch {}
  try { unlinkSync(PRE_CALL_STATE); } catch {}
}

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

// ── 터미널 출력 (1~2줄 이내) ──────────────────────────────────────
const elapsed    = (wallElapsedMs / 1000).toFixed(1);
const statusIcon = meta.status === "error" ? "❌" : "✅";

// 모델 표시명
const MODEL_SHORT = {
  "gpt-5.3-codex":  "GPT",
  "gemini-2.5-pro": "Gemini",
  "glm-5":          "GLM",
};
let modelDisplay = meta.model ? (MODEL_SHORT[meta.model] ?? meta.model) : tool;
if (meta.models && Array.isArray(meta.models)) {
  modelDisplay = meta.models.map(m => MODEL_SHORT[m] ?? m).join("+");
}

const parts = [`${statusIcon} ${modelDisplay}`];
if (meta.category) parts.push(`[${meta.category}]`);
if (meta.routing && meta.routing.includes("fail")) parts.push("(fallback)");

console.log(`${parts.join(" ")} — ${elapsed}s`);
