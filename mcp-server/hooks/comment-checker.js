#!/usr/bin/env node
/**
 * Comment Checker Hook — PostToolUse on Write/Edit
 *
 * Detects excessive AI-style comments and reminds the agent
 * to write clean, professional code without AI slop.
 *
 * Install: Add to settings.json hooks → PostToolUse
 * Command: node ~/mcp-servers/multi-model/hooks/comment-checker.js
 */

// ── stdin 읽기 (for await 패턴 — 다른 훅과 통일) ──────────────
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString("utf8").trim();
if (!raw) process.exit(0);

let input;
try { input = JSON.parse(raw); } catch { process.exit(0); }

// Only check Write and Edit tool outputs
const toolName = input?.tool_name ?? input?.tool ?? input?.tool_use?.name ?? "";
if (!/(write|edit)/i.test(toolName)) process.exit(0);

const content =
  input?.tool_output ??
  input?.output ??
  input?.content ??
  input?.tool_input?.content ??
  input?.tool_input?.new_content ??
  "";
if (!content || typeof content !== "string") process.exit(0);

// AI slop patterns to catch
const SLOP_PATTERNS = [
  /\/\/\s*TODO:\s*implement/gi,
  /\/\/\s*Add .* here/gi,
  /\/\/\s*This (function|method|class|component) .* (handles|manages|processes|is responsible)/gi,
  /#\s*This (function|method|class|module) .* (handles|manages|processes)/gi,
  /\/\*\*?\s*\n\s*\*\s*(This|The) (function|method|class|module|component)/gi,
  /\/\/\s*Helper function (that|to|for|which)/gi,
  /\/\/\s*Returns? the/gi,
  /\/\/\s*Gets? the/gi,
  /\/\/\s*Sets? the/gi,
  /\/\/\s*Checks? (if|whether)/gi,
];

// Exceptions: keep these
const EXCEPTION_PATTERNS = [
  /\/\/\s*@ts-/,
  /\/\/\s*eslint-/,
  /\/\/\s*prettier-/,
  /@param\s/,
  /@returns?\s/,
  /\/\/\s*(SAFETY|WARNING|HACK|NOTE|FIXME|BUG|XXX):/,
  /\/\/\s*Copyright/i,
  /\/\/\s*License/i,
  /\/\*\*/, // JSDoc opening
];

let slopCount = 0;
const lines = content.split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  if (EXCEPTION_PATTERNS.some((p) => p.test(trimmed))) continue;
  if (SLOP_PATTERNS.some((p) => p.test(trimmed))) slopCount++;
}

if (slopCount >= 3) {
  console.log(
    `\n⚠️  Comment Quality Warning: ${slopCount} AI-style comments detected.\n\nReminders:\n- Don't explain WHAT the code does — the code itself does that\n- Only comment the WHY (rationale, non-obvious decisions)\n- "// This function handles X" — delete it. Function name should say that.\n- "// Returns the Y" — delete it. Return type says that.\n- Comments should make you smarter about the code, not just restate it.`
  );
}
