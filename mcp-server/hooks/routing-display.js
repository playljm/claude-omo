#!/usr/bin/env node
/**
 * Routing Display Hook — PostToolUse
 *
 * MCP multi-model-agent 도구 호출 후 라우팅 정보를 출력합니다.
 * Claude Code의 hook 파이프는 ANSI를 지원하지 않으므로 유니코드만 사용합니다.
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const LAST_ROUTE_PATH = join(homedir(), "mcp-servers", "multi-model", "last-route.json");

const MODEL_DISPLAY = {
  gpt:      "GPT-5.3-Codex",
  gemini:   "Gemini 2.5 Pro",
  glm:      "GLM-4.7-Flash",
  parallel: "All Models",
};

const MODEL_ICON = {
  gpt:      "🧠",
  gemini:   "♊",
  glm:      "⚡",
  parallel: "🔀",
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

// ─── stdin 읽기 ─────────────────────────────────────────────────
const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const raw = Buffer.concat(chunks).toString("utf8").trim();
if (!raw) process.exit(0);

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = input?.tool_name ?? input?.tool ?? input?.tool_use?.name ?? "";
if (!toolName.includes("multi-model-agent")) process.exit(0);

// ─── last-route.json 읽기 ────────────────────────────────────────
if (!existsSync(LAST_ROUTE_PATH)) process.exit(0);

let route;
try {
  route = JSON.parse(readFileSync(LAST_ROUTE_PATH, "utf8"));
} catch {
  process.exit(0);
}

if (Date.now() - new Date(route.timestamp).getTime() > 10000) process.exit(0);

// ─── 출력 구성 (고정 박스 없음 — 한글/이모지 열폭 문제 회피) ────
const modelIcon = MODEL_ICON[route.model] ?? "🤖";
const modelName = MODEL_DISPLAY[route.model] ?? route.model;
const catIcon   = route.category ? (CATEGORY_ICON[route.category] ?? "📌") : "";
const effortStr = route.effort && route.effort !== "none" ? `  ·  reasoning: ${route.effort}` : "";

const SEP = "─".repeat(46);
const lines = [`┌─ 🔀 ROUTING ${SEP}`];

if (route.tool === "ask_parallel") {
  lines.push(`│  🔀  모든 모델 동시 호출 (Parallel)`);
  const modelList = (route.models ?? ["gpt", "gemini", "glm"])
    .map((m) => `${MODEL_ICON[m] ?? "🤖"} ${MODEL_DISPLAY[m] ?? m}`)
    .join("  +  ");
  lines.push(`│  ${modelList}`);
} else {
  lines.push(`│  ${modelIcon} ${modelName}${effortStr}`);
  if (route.category) {
    lines.push(`│  ${catIcon} ${route.category}  →  ${route.reason ?? route.category}`);
  }
  if (route.didFallback && route.fallbackFrom) {
    const fbName = MODEL_DISPLAY[route.fallbackFrom] ?? route.fallbackFrom;
    lines.push(`│  ⚠  폴백: ${fbName} 실패 → ${modelName}`);
  }
}

lines.push(`└${"─".repeat(59)}`);

process.stdout.write(lines.join("\n") + "\n");
