#!/usr/bin/env node
// SessionEnd hook: 오늘의 외부 모델 사용량 요약
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const logPath = join(homedir(), "mcp-servers", "multi-model", "usage-log.jsonl");
if (!existsSync(logPath)) process.exit(0);

const lines = readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
const today = new Date().toDateString();
const entries = lines.filter((l) => {
  try { return new Date(JSON.parse(l).timestamp).toDateString() === today; }
  catch { return false; }
});

if (entries.length === 0) {
  console.log("[multi-model] 오늘 외부 모델 호출 없음");
  process.exit(0);
}

const byModel = {};
entries.forEach((l) => {
  try {
    const e = JSON.parse(l);
    if (!byModel[e.model]) byModel[e.model] = { calls: 0, tokens: 0, categories: new Set() };
    byModel[e.model].calls++;
    byModel[e.model].tokens += e.total_tokens;
    if (e.category) byModel[e.model].categories.add(e.category);
  } catch { /* skip */ }
});

console.log("\n=== 오늘의 외부 모델 사용 ===");
for (const [model, s] of Object.entries(byModel)) {
  const cats = s.categories.size > 0 ? ` [${[...s.categories].join(", ")}]` : "";
  console.log(`  ${model}: ${s.calls}회, ${s.tokens.toLocaleString()}토큰${cats}`);
}
console.log("================================");
