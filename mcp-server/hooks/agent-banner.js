#!/usr/bin/env node
/**
 * Agent Banner Hook — PreToolUse (matcher: "Task")
 *
 * Task 도구 호출 시 subagent_type에 따라 에이전트 배너를 터미널에 표시한다.
 * CONOUT$ 직접 쓰기로 Claude Code의 stdio 파이핑을 우회한다.
 */

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

const raw = Buffer.concat(chunks).toString("utf8").trim();
if (!raw) process.exit(0);

let input;
try { input = JSON.parse(raw); } catch { process.exit(0); }

const toolName = input?.tool_name ?? input?.tool ?? "";
if (!toolName.includes("Task") && toolName !== "Task") process.exit(0);

const toolInput = input?.tool_input ?? input?.input ?? {};
const agentType = toolInput?.subagent_type ?? "";
const description = toolInput?.description ?? "";

// ── 에이전트별 배너 정의 ─────────────────────────────────────────
const E = "\x1b";
const AGENTS = {
  "oracle":       { icon: "🔮", label: "ORACLE",       sub: "아키텍처 자문",   color: `${E}[1;95m` },
  "researcher":   { icon: "🔬", label: "RESEARCHER",   sub: "코드베이스 분석", color: `${E}[1;94m` },
  "worker":       { icon: "⚙", label: "WORKER",       sub: "구현 작업",       color: `${E}[1;93m` },
  "reviewer":     { icon: "👁", label: "REVIEWER",     sub: "코드 검토",       color: `${E}[1;92m` },
  "explore":      { icon: "🔍", label: "EXPLORE",      sub: "빠른 탐색",       color: `${E}[1;96m` },
  "Explore":      { icon: "🔍", label: "EXPLORE",      sub: "빠른 탐색",       color: `${E}[1;96m` },
  "hephaestus":   { icon: "🔨", label: "HEPHAESTUS",   sub: "자율 구현",       color: `${E}[1;91m` },
  "sisyphus":     { icon: "♾", label: "SISYPHUS",     sub: "오케스트레이터",  color: `${E}[1;96m` },
  "debugger":     { icon: "🐛", label: "DEBUGGER",     sub: "디버그 분석",     color: `${E}[1;91m` },
  "prometheus":   { icon: "📋", label: "PROMETHEUS",   sub: "전략 플래닝",     color: `${E}[1;33m` },
  "atlas":        { icon: "🗺", label: "ATLAS",        sub: "투두 오케스트레이터", color: `${E}[1;33m` },
  "general-purpose": { icon: "🤖", label: "AGENT",    sub: "범용 에이전트",   color: `${E}[1;97m` },
};

const agent = AGENTS[agentType];
if (!agent) process.exit(0);

// ── 배너 생성 ─────────────────────────────────────────────────────
const RST = `${E}[0m`;
const DIM = `${E}[2m`;
const c = agent.color;

// description 요약 (30자 이내)
const desc = description.length > 30 ? description.slice(0, 29) + "…" : description;
const descLine = desc ? `\n${DIM}  → ${desc}${RST}` : "";

const banner =
  `\n${c}╔══════════════════════════════════════╗${RST}\n` +
  `${c}║${RST}  ${agent.icon} ${c}${agent.label}${RST}  ${DIM}— ${agent.sub}${RST}${" ".repeat(Math.max(0, 22 - agent.label.length - agent.sub.length))}${c}║${RST}\n` +
  `${c}╚══════════════════════════════════════╝${RST}${descLine}\n`;

// ── CONOUT$ 직접 쓰기 (파이프 우회) ──────────────────────────────
try {
  const { openSync, writeSync, closeSync } = await import("fs");
  const fd = openSync("\\\\.\\CONOUT$", "a");
  writeSync(fd, banner);
  closeSync(fd);
} catch {
  process.stderr.write(banner);
}
