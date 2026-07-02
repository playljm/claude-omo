import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function runScript(relativePath, payload, env = {}) {
  return spawnSync(process.execPath, [join(ROOT, relativePath)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("write-guard denies Write on existing files", () => {
  const dir = mkdtempSync(join(tmpdir(), "omo-write-guard-"));
  try {
    const filePath = join(dir, "existing.txt");
    writeFileSync(filePath, "old");

    const result = runScript("hooks/write-guard.js", {
      tool_name: "Write",
      tool_input: { file_path: filePath },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /blocked full overwrite/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write-guard allows Write on new files", () => {
  const dir = mkdtempSync(join(tmpdir(), "omo-write-guard-"));
  try {
    const result = runScript("hooks/write-guard.js", {
      tool_name: "Write",
      tool_input: { file_path: join(dir, "new.txt") },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write-guard preserves advisory mode when requested", () => {
  const dir = mkdtempSync(join(tmpdir(), "omo-write-guard-"));
  try {
    const filePath = join(dir, "existing.txt");
    writeFileSync(filePath, "old");

    const result = runScript(
      "hooks/write-guard.js",
      { tool_name: "Write", tool_input: { file_path: filePath } },
      { OMO_WRITE_GUARD_MODE: "warn" },
    );

    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Write Guard blocked full overwrite/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ulw-detector ignores incidental loop keyword mentions", () => {
  const result = runScript("ulw-detector.js", {
    prompt: "사용자 피드백에 ulw와 hardmode 키워드가 언급됐는지 확인해줘",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("ulw-detector accepts explicit ULW trigger", () => {
  const result = runScript("ulw-detector.js", {
    prompt: "ulw: 이 작업을 끝까지 점검해줘",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /ULW MODE/);
  assert.match(result.stderr, /ULW MODE/);
});

test("ulw-detector accepts explicit HARD trigger", () => {
  const result = runScript("ulw-detector.js", {
    prompt: "hardmode: 릴리스 전 점검해줘",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /HARD MODE/);
  assert.match(result.stderr, /HARD MODE/);
});

test("provider selftest keeps quick route aligned with docs", () => {
  const result = spawnSync(process.execPath, [join(ROOT, "index.js"), "--selftest"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.routing.quick.provider, "gpt");
  assert.equal(output.routing.quick.effort, "none");
  assert.deepEqual(output.routing.quick.fallback, ["glm"]);
});
