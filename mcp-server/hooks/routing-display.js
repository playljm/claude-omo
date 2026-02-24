#!/usr/bin/env node
/**
 * Routing Display Hook — PostToolUse
 *
 * MCP multi-model-agent 도구 호출 후 라우팅 정보를 ANSI 색상으로 출력합니다.
 * last-route.json을 읽어 어떤 모델/카테고리가 선택됐는지 시각화.
 *
 * Install: settings.json → hooks → PostToolUse
 *   matcher: "mcp__multi-model-agent__smart_route|mcp__multi-model-agent__ask_gpt|..."
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const LAST_ROUTE_PATH = join(homedir(), "mcp-servers", "multi-model", "last-route.json");

// ─── ANSI 색상 팔레트 ───────────────────────────────────────────
const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  cyan:    "\x1b[36m",
  yellow:  "\x1b[33m",
  green:   "\x1b[32m",
  red:     "\x1b[31m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  gray:    "\x1b[90m",
  white:   "\x1b[97m",
};

const MODEL_DISPLAY = {
  gpt:      "GPT-5.3-Codex",
  gemini:   "Gemini 2.5 Pro",
  glm:      "GLM-4.7-Flash",
  parallel: "All Models (Parallel)",
};

// 모델별 색상
const MODEL_COLOR = {
  gpt:      C.cyan,
  gemini:   C.blue,
  glm:      C.magenta,
  parallel: C.yellow,
};

// 카테고리별 색상
const CATEGORY_COLOR = {
  ultrabrain: C.red + C.bold,
  deep:       C.yellow,
  visual:     C.cyan,
  research:   C.blue,
  bulk:       C.magenta,
  writing:    C.green,
  quick:      C.gray,
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

// 도구 이름 확인 (multi-model-agent 도구만 처리)
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

// 5초 이상 지난 trace는 무시 (stale 방지)
if (Date.now() - new Date(route.timestamp).getTime() > 5000) process.exit(0);

// ─── 출력 구성 ──────────────────────────────────────────────────
const modelColor = MODEL_COLOR[route.model] ?? C.yellow;
const modelName  = MODEL_DISPLAY[route.model] ?? route.model;
const effortStr  = route.effort && route.effort !== "none"
  ? ` ${C.dim}(reasoning: ${route.effort})${C.reset}`
  : "";

const sep = `${C.gray}│${C.reset}`;

const lines = [
  `${C.gray}╭─ ${C.bold}${C.white}🔀 ROUTING${C.reset}${C.gray} ────────────────────────────────${C.reset}`,
];

// 카테고리 (smart_route만 해당)
if (route.category) {
  const catColor = CATEGORY_COLOR[route.category] ?? C.yellow;
  lines.push(`${sep}  ${C.dim}카테고리${C.reset} : ${catColor}${route.category}${C.reset}`);
}

// 모델명
lines.push(`${sep}  ${C.dim}모    델${C.reset} : ${modelColor}${C.bold}${modelName}${C.reset}${effortStr}`);

// ask_parallel 모델 목록
if (route.models && Array.isArray(route.models)) {
  const modelList = route.models
    .map((m) => `${MODEL_COLOR[m] ?? C.yellow}${(MODEL_DISPLAY[m] ?? m).split("-")[0]}${C.reset}`)
    .join(` ${C.gray}+${C.reset} `);
  lines.push(`${sep}  ${C.dim}대    상${C.reset} : ${modelList}`);
}

// 이유
if (route.reason) {
  lines.push(`${sep}  ${C.dim}이    유${C.reset} : ${C.dim}${route.reason}${C.reset}`);
}

// 폴백 경고
if (route.didFallback && route.fallbackFrom) {
  const fbName = (MODEL_DISPLAY[route.fallbackFrom] ?? route.fallbackFrom).split("-")[0];
  lines.push(
    `${sep}  ${C.red}⚠ 폴  백${C.reset} : ${C.dim}${fbName}${C.reset} ${C.red}실패${C.reset} → ${modelColor}${C.bold}${modelName}${C.reset}`
  );
}

lines.push(`${C.gray}╰────────────────────────────────────────────────${C.reset}`);

process.stdout.write(lines.join("\n") + "\n");
