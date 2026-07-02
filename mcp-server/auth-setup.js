#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { execFile, spawn } from "child_process";
import readline from "readline/promises";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_NAME = "multi-model-agent";
const PRIMARY_CONFIG = join(homedir(), ".claude.json");
const FALLBACK_CONFIG = join(homedir(), ".claude", "settings.json");
const AUTH_KEYS = ["GLM_API_KEY", "OPENAI_API_KEY"];

function parseArgs(argv) {
  const args = {
    status: false,
    applyEnv: false,
    quiet: false,
    config: null,
    mcpDir: SELF_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--status") args.status = true;
    else if (arg === "--apply-env") args.applyEnv = true;
    else if (arg === "--quiet") args.quiet = true;
    else if (arg === "--config") args.config = argv[++i];
    else if (arg === "--mcp-dir") args.mcpDir = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node auth-setup.js [options]

Options:
  --status           현재 MCP 인증 설정 상태만 표시
  --apply-env        현재 프로세스의 GLM_API_KEY/OPENAI_API_KEY를 MCP env에 저장
  --config <path>    설정 파일 경로 지정 (기본: ~/.claude.json)
  --mcp-dir <path>   MCP 서버 디렉터리 지정 (기본: 이 스크립트 위치)
  --quiet            변경 결과만 간단히 출력
`);
}

function readJson(file) {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

function getConfigPath(explicitPath = null) {
  if (explicitPath) return resolve(explicitPath);
  if (existsSync(PRIMARY_CONFIG)) return PRIMARY_CONFIG;
  if (existsSync(FALLBACK_CONFIG) && readJson(FALLBACK_CONFIG).mcpServers?.[SERVER_NAME]) {
    return FALLBACK_CONFIG;
  }
  return PRIMARY_CONFIG;
}

function getExistingServer(configPath) {
  const data = readJson(configPath);
  return data.mcpServers?.[SERVER_NAME] ?? {};
}

function makeServerEntry(existing, mcpDir, nextEnv) {
  const command = existing.command || "node";
  const args = Array.isArray(existing.args) && existing.args.length
    ? existing.args
    : [join(resolve(mcpDir), "index.js")];
  const entry = {
    ...existing,
    command,
    args,
    env: nextEnv,
  };
  if (Object.keys(nextEnv).length === 0) delete entry.env;
  return entry;
}

function readEnv(configPath) {
  return { ...(getExistingServer(configPath).env ?? {}) };
}

function applyEnv(configPath, mcpDir, updates) {
  const data = readJson(configPath);
  const mcpServers = data.mcpServers ?? {};
  const existing = mcpServers[SERVER_NAME] ?? {};
  const nextEnv = { ...(existing.env ?? {}) };

  for (const [key, value] of Object.entries(updates)) {
    if (!AUTH_KEYS.includes(key)) continue;
    if (value === null) delete nextEnv[key];
    else if (value !== undefined && value !== "") nextEnv[key] = value;
  }

  mcpServers[SERVER_NAME] = makeServerEntry(existing, mcpDir, nextEnv);
  data.mcpServers = mcpServers;
  writeJson(configPath, data);
  return nextEnv;
}

function keyStatus(value) {
  return value ? `설정됨 (길이 ${String(value).length})` : "없음";
}

function checkCommand(command, args = ["--version"], timeout = 5000) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout }, (error) => resolve(!error));
  });
}

async function collectStatus(configPath) {
  const env = readEnv(configPath);
  return {
    configPath,
    glm: keyStatus(env.GLM_API_KEY),
    openai: keyStatus(env.OPENAI_API_KEY),
    claudeCli: await checkCommand("claude"),
    codexCli: await checkCommand("codex"),
    codexAuthJson: existsSync(join(homedir(), ".codex", "auth.json")),
  };
}

function printStatus(status) {
  console.log("=== claude-omo 인증 상태 ===");
  console.log(`config: ${status.configPath}`);
  console.log(`GLM_API_KEY: ${status.glm}`);
  console.log(`OPENAI_API_KEY: ${status.openai}`);
  console.log(`claude CLI: ${status.claudeCli ? "있음" : "없음"}`);
  console.log(`codex CLI: ${status.codexCli ? "있음" : "없음"}`);
  console.log(`codex auth.json: ${status.codexAuthJson ? "있음" : "없음"}`);
}

function readHidden(prompt) {
  if (!process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolveValue) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";
    let done = false;
    const wasRaw = stdin.isRaw;

    function cleanup() {
      stdin.off("data", onData);
      if (stdin.setRawMode) stdin.setRawMode(Boolean(wasRaw));
      stdout.write("\n");
    }

    function finish(result) {
      if (done) return;
      done = true;
      cleanup();
      resolveValue(result);
    }

    function onData(buffer) {
      const text = buffer.toString("utf8");
      for (const char of text) {
        if (char === "\u0003") {
          cleanup();
          process.exit(130);
        }
        if (char === "\r" || char === "\n") {
          finish(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    }

    stdout.write(prompt);
    stdin.resume();
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.on("data", onData);
  });
}

async function askYesNo(question, defaultNo = true) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultNo ? " [y/N]: " : " [Y/n]: ";
  const answer = (await rl.question(question + suffix)).trim().toLowerCase();
  rl.close();
  if (!answer) return !defaultNo;
  return answer === "y" || answer === "yes" || answer === "예" || answer === "ㅇ";
}

async function runCodexLogin() {
  return new Promise((resolveCode) => {
    const child = spawn("codex", ["login"], { stdio: "inherit" });
    child.on("error", () => resolveCode(1));
    child.on("exit", (code) => resolveCode(code ?? 1));
  });
}

async function interactiveSetup(configPath, mcpDir) {
  printStatus(await collectStatus(configPath));
  const current = readEnv(configPath);
  const updates = {};

  console.log("");
  console.log("입력 규칙: Enter=유지, '-'=삭제, 새 값=저장. 입력값은 화면에 표시하지 않음.");
  for (const key of AUTH_KEYS) {
    const label = `${key} [현재 ${current[key] ? "설정됨" : "없음"}]: `;
    const value = await readHidden(label);
    if (value === "-") updates[key] = null;
    else if (value.trim()) updates[key] = value.trim();
  }

  if (Object.keys(updates).length > 0) {
    applyEnv(configPath, mcpDir, updates);
    console.log("MCP env 저장 완료. Claude Code를 재시작하면 새 값이 반영됨.");
  } else {
    console.log("변경한 API 키 없음.");
  }

  const after = await collectStatus(configPath);
  if (!readEnv(configPath).OPENAI_API_KEY && after.codexCli) {
    const login = await askYesNo("OPENAI_API_KEY 없이 codex CLI 로그인으로 GPT를 쓰려면 지금 codex login을 실행할까?");
    if (login) {
      const code = await runCodexLogin();
      console.log(code === 0 ? "codex login 완료." : "codex login 실패 또는 취소.");
    }
  }

  console.log("");
  printStatus(await collectStatus(configPath));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = getConfigPath(args.config);
  const mcpDir = resolve(args.mcpDir);

  if (args.status) {
    printStatus(await collectStatus(configPath));
    return;
  }

  if (args.applyEnv) {
    const updates = {};
    for (const key of AUTH_KEYS) {
      if (process.env[key]) updates[key] = process.env[key];
    }
    const nextEnv = applyEnv(configPath, mcpDir, updates);
    if (!args.quiet) {
      console.log(`MCP env 저장 완료: ${Object.keys(nextEnv).join(", ") || "없음"}`);
      printStatus(await collectStatus(configPath));
    }
    return;
  }

  if (!process.stdin.isTTY) {
    printStatus(await collectStatus(configPath));
    return;
  }

  await interactiveSetup(configPath, mcpDir);
}

main().catch((error) => {
  console.error(`[auth-setup 오류] ${error.message}`);
  process.exit(1);
});
