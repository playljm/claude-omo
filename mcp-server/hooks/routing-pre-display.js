#!/usr/bin/env node
/**
 * routing-pre-display.js — PreToolUse 훅
 *
 * multi-model-agent MCP 도구 호출 시작 전 알림을 표시합니다.
 * Claude Code 훅 시스템: stdin에서 JSON 읽어 stderr로 알림 출력.
 *
 * 지원 도구: smart_route, ask_gpt, ask_gemini, ask_glm, ask_parallel
 */

import { readFileSync } from "fs";

let raw = "";
try {
  raw = readFileSync("/dev/stdin", "utf8");
} catch {
  // stdin 읽기 실패 — 무시 (허용)
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  // JSON 파싱 실패 — 허용 (기본 동작)
  process.exit(0);
}

const toolName = payload?.tool_name ?? payload?.tool?.name ?? "";
const toolInput = payload?.tool_input ?? payload?.tool?.input ?? {};

// multi-model-agent MCP 도구만 처리
if (!toolName.includes("multi-model-agent") && !toolName.includes("smart_route") &&
    !["ask_gpt", "ask_gemini", "ask_glm", "ask_parallel", "smart_route"].includes(toolName)) {
  process.exit(0);
}

// 도구명 정규화 (mcp__multi-model-agent__ask_gpt → ask_gpt)
const shortName = toolName.replace(/^mcp__[^_]+__/, "");

const MODEL_LABELS = {
  smart_route:  "🔀 smart_route",
  ask_gpt:      "🤖 GPT-5.3-Codex",
  ask_gemini:   "✨ Gemini 2.5 Pro",
  ask_glm:      "⚡ GLM-5",
  ask_parallel: "🔄 ask_parallel (GPT+Gemini+GLM)",
};

const label = MODEL_LABELS[shortName] ?? `🔧 ${shortName}`;

let detail = "";
if (shortName === "smart_route") {
  const cat = toolInput.category ? ` [${toolInput.category}]` : "";
  const taskPreview = (toolInput.task ?? "").slice(0, 60);
  detail = `${cat} "${taskPreview}${taskPreview.length >= 60 ? "..." : ""}"`;
} else if (shortName === "ask_gpt") {
  const effort = toolInput.reasoning_effort ?? "medium";
  detail = `reasoning: ${effort}`;
} else if (shortName === "ask_parallel") {
  const models = (toolInput.models ?? ["gpt", "gemini", "glm"]).join(", ");
  detail = `models: ${models}`;
} else if (shortName === "ask_gemini" || shortName === "ask_glm") {
  const mt = toolInput.max_tokens;
  detail = mt ? `max_tokens: ${mt}` : "";
}

const msg = detail ? `⏳ CALLING ${label} — ${detail}` : `⏳ CALLING ${label}`;
process.stderr.write(msg + "\n");

// 허용 (차단 안 함)
process.exit(0);
