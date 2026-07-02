#!/usr/bin/env node
/**
 * Write Guard Hook — PreToolUse on Write
 *
 * Blocks accidental full-file overwrites of existing files.
 * Set OMO_WRITE_GUARD_MODE=warn to keep the legacy advisory-only behavior.
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

  if (existsSync(filePath)) {
    const reason =
      `Write Guard blocked full overwrite of existing file: ${filePath}\n\n` +
      "Use Edit/MultiEdit for targeted changes. If a full rewrite is intentional, " +
      "set OMO_WRITE_GUARD_MODE=warn for this hook and retry.";

    const mode = (process.env.OMO_WRITE_GUARD_MODE ?? "block").toLowerCase();
    if (mode === "warn" || mode === "advisory") {
      process.stderr.write(`\n⚠️  ${reason}\n`);
      process.exit(0);
    }
    if (mode === "off" || mode === "allow") {
      process.exit(0);
    }

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }));
  }
});
