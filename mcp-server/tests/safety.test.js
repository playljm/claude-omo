import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  assert.match(result.stdout, /blocker가 2회 반복/);
  assert.match(result.stderr, /ULW MODE/);
});

test("ulw-detector accepts explicit HARD trigger", () => {
  const result = runScript("ulw-detector.js", {
    prompt: "hardmode: 릴리스 전 점검해줘",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /HARD MODE/);
  assert.match(result.stdout, /blocker가 2회 반복/);
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
  const providers = JSON.parse(readFileSync(join(ROOT, "providers.json"), "utf8"));
  assert.deepEqual(providers.providers.gpt.auth.auth_priority, ["api_key", "codex_cli"]);
  assert.equal(providers.providers.gpt.auth.allow_chatgpt_oauth, false);
});

test("auth-setup stores env without printing secret values", () => {
  const dir = mkdtempSync(join(tmpdir(), "omo-auth-setup-"));
  try {
    const configPath = join(dir, "claude.json");
    const glmKey = "test-glm-key-value";
    const openaiKey = "test-openai-key-value";

    const applyResult = spawnSync(
      process.execPath,
      [join(ROOT, "auth-setup.js"), "--apply-env", "--config", configPath, "--mcp-dir", ROOT],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GLM_API_KEY: glmKey,
          OPENAI_API_KEY: openaiKey,
        },
      },
    );

    assert.equal(applyResult.status, 0);
    assert.doesNotMatch(applyResult.stdout, new RegExp(glmKey));
    assert.doesNotMatch(applyResult.stdout, new RegExp(openaiKey));

    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const env = config.mcpServers["multi-model-agent"].env;
    assert.equal(env.GLM_API_KEY, glmKey);
    assert.equal(env.OPENAI_API_KEY, openaiKey);

    const statusResult = spawnSync(
      process.execPath,
      [join(ROOT, "auth-setup.js"), "--status", "--config", configPath],
      { encoding: "utf8" },
    );

    assert.equal(statusResult.status, 0);
    assert.match(statusResult.stdout, /GLM_API_KEY: 설정됨/);
    assert.match(statusResult.stdout, /OPENAI_API_KEY: 설정됨/);
    assert.doesNotMatch(statusResult.stdout, new RegExp(glmKey));
    assert.doesNotMatch(statusResult.stdout, new RegExp(openaiKey));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
