#!/usr/bin/env node
/**
 * Write Guard Hook — PreToolUse on Write
 *
 * Prevents accidental overwrites of existing files
 * when the agent hasn't read them first.
 *
 * Install: Add to settings.json hooks → PreToolUse
 * Command: node ~/mcp-servers/multi-model/hooks/write-guard.js
 */

import { existsSync } from "fs";

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) process.exit(0);

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  // Only check Write tool
  const toolName =
    input?.tool_name ?? input?.tool ?? input?.tool_use?.name ?? "";
  if (!/^write$/i.test(toolName)) process.exit(0);

  const filePath =
    input?.tool_input?.file_path ??
    input?.input?.file_path ??
    input?.tool_use?.input?.file_path ??
    "";

  if (!filePath) process.exit(0);

  // Check if file exists
  if (existsSync(filePath)) {
    console.log(
      `\n⚠️  Write Guard: "${filePath}" already exists.\n\nBefore overwriting:\n1. Read the current file with the Read tool\n2. Understand the existing code\n3. Use Edit for targeted changes (preferred over full Write)\n\nIf full rewrite is intentional, proceed. Otherwise, use Edit.`
    );
  }
});
