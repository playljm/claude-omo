#!/usr/bin/env node
/**
 * Routing Display Hook — PostToolUse
 * v5.4: last-call.json 기반 라우팅 정보 박스 출력
 *
 * MCP multi-model-agent 도구 호출 후 라우팅 정보를 출력합니다.
 * Claude Code의 hook 파이프는 ANSI를 지원하지 않으므로 유니코드만 사용합니다.
 * 등록: settings.json PostToolUse — matcher: "mcp__multi-model-agent"
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const LAST_CALL_PATH = join(homedir(), "mcp-servers", "multi-model", "last-call.json");

const MODEL_DISPLAY = {
  "gpt-5.3-codex": "GPT-5.3-Codex",
  "glm-5":         "GLM-5",
  "parallel":      "All Models",
};

const MODEL_ICON = {
  "gpt-5.3-codex": "🧠",
  "glm-5":         "⚡",
  "parallel":      "🔀",
};

const CATEGORY_ICON = {
  ultrabrain: "🏛",
  deep:       "🔬",
  visual:     "🎨",
  research:   "📚",
  bulk:       "⚙️",
  writing:    "✍️",
  quick:      "⚡",
};

// ─── stdin 읽기 (for await 패턴 — Windows 호환) ─────────────────
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

// ─── last-call.json 읽기 (index.js가 작성) ──────────────────────
if (!existsSync(LAST_CALL_PATH)) process.exit(0);

let meta;
try { meta = JSON.parse(readFileSync(LAST_CALL_PATH, "utf8")); } catch { process.exit(0); }

// 10초 이내 기록만 신뢰
if (meta.timestamp && Date.now() - new Date(meta.timestamp).getTime() > 10000) process.exit(0);

// ─── 출력 구성 ───────────────────────────────────────────────────
const modelKey  = meta.model ?? "unknown";
const modelIcon = MODEL_ICON[modelKey] ?? "🤖";
const modelName = MODEL_DISPLAY[modelKey] ?? modelKey;
const effortStr = meta.reasoning_effort && meta.reasoning_effort !== "none"
  ? `  ·  reasoning: ${meta.reasoning_effort}` : "";
const catIcon = meta.category ? (CATEGORY_ICON[meta.category] ?? "📌") : "";

const SEP = "─".repeat(44);
const lines = [`┌─ 🔀 ROUTING ${SEP}`];

if (tool === "ask_parallel" || modelKey === "parallel") {
  lines.push(`│  🔀  모든 모델 동시 호출 (Parallel)`);
  const modelList = (meta.models ?? ["gpt", "glm"])
    .map((m) => {
      const key = m === "gpt" ? "gpt-5.3-codex" : m === "glm" ? "glm-5" : m;
      return `${MODEL_ICON[key] ?? "🤖"} ${MODEL_DISPLAY[key] ?? m}`;
    })
    .join("  +  ");
  lines.push(`│  ${modelList}`);
} else {
  lines.push(`│  ${modelIcon} ${modelName}${effortStr}`);
  if (meta.category) {
    lines.push(`│  ${catIcon} ${meta.category}`);
  }
  if (meta.routing && meta.routing.includes("fail")) {
    lines.push(`│  ⚠  폴백 발생`);
  }
}

lines.push(`└${"─".repeat(57)}`);

process.stdout.write(lines.join("\n") + "\n");
