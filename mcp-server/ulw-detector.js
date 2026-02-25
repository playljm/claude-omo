#!/usr/bin/env node
/**
 * ULW (Ultrawork) Mode Detector — UserPromptSubmit Hook
 *
 * "ulw" 또는 "ultrawork" 키워드 감지 시 시지프스 모드 지시를 주입한다.
 * Claude Code가 UserPromptSubmit 시 이 스크립트를 실행하고,
 * stdout 출력을 Claude에게 추가 컨텍스트로 전달한다.
 */

// stdin에서 JSON 읽기 (Claude Code가 prompt 전달)
const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const raw = Buffer.concat(chunks).toString("utf8").trim();
if (!raw) process.exit(0);

let prompt = "";
try {
  const input = JSON.parse(raw);
  prompt = input?.prompt ?? input?.message ?? input?.user_prompt ?? "";
} catch {
  prompt = raw;
}

if (/\bulw\b|\bultrawork\b/i.test(prompt)) {
  const instructions = `╔══════════════════════════════════════╗
║  ULW MODE (Ultrawork) — 시지프스     ║
╚══════════════════════════════════════╝

다음 규칙을 지금부터 엄수하세요:

1. 즉시 TodoWrite로 모든 서브태스크를 나열 (빠짐없이)
2. 모든 투두가 ✅ 체크될 때까지 절대 종료 금지
3. 독립적인 서브태스크는 병렬 Task 에이전트로 동시 실행
4. 에이전트 위임 기준:
   - 코드베이스 전체/대형 파일 분석 → Task(subagent_type="researcher")
   - CRUD/보일러플레이트/반복 구현  → Task(subagent_type="worker")
   - 아키텍처 결정/설계 자문        → Task(subagent_type="oracle")
   - 코드 리뷰/교차 검증            → Task(subagent_type="reviewer")
   - 빠른 파일 검색/패턴 탐색       → Task(subagent_type="explore")
5. 막히면 우회로 찾기, 다른 경로로 계속 진행
6. 완료 선언은 모든 투두 항목 체크 후에만 가능

응답 포맷 규칙 (반드시 준수):
- 섹션마다 이모지 헤더 사용: 🔍 분석, 🚀 실행, ✅ 완료, ⚠️ 주의, ❌ 오류
- 상태 표시: ✅ 성공 / ❌ 실패 / ⚠️ 경고 / 🔄 진행중 / 📌 참고
- 우선순위 표시: 🔴 Critical / 🟡 Major / 🟢 Minor
- 완료 보고는 반드시 이모지 포함 구조화 형식으로 작성
- 숫자 목록은 1️⃣2️⃣ 키캡 이모지 금지 → ①②③④⑤⑥⑦⑧⑨ 사용 (터미널 호환)
- 텍스트 박스/헤더는 유니코드 박스문자 사용: ┌─┐│└─┘ 또는 ╔═╗║╚═╝`;

  // stdout → Claude 컨텍스트 주입
  console.log(instructions);

  // Windows CONOUT$ 직접 쓰기 (Claude Code의 stdio 파이핑 우회)
  // PowerShell/Windows Terminal에서 ANSI 색상 배너를 실제로 표시
  const E = "\x1b";
  const banner =
    `\n${E}[1;96m╔══════════════════════════════════════╗${E}[0m\n` +
    `${E}[1;96m║${E}[0m  ${E}[1;93m⚡ ULW MODE${E}[0m ${E}[1;97m(Ultrawork)${E}[0m ${E}[2m— 시지프스${E}[0m     ${E}[1;96m║${E}[0m\n` +
    `${E}[1;96m╚══════════════════════════════════════╝${E}[0m\n`;

  try {
    // Windows: CONOUT$는 현재 콘솔에 직접 쓰기 (파이프 우회)
    const { openSync, writeSync, closeSync } = await import("fs");
    const fd = openSync("\\\\.\\CONOUT$", "a");
    writeSync(fd, banner);
    closeSync(fd);
  } catch {
    // 폴백: stderr (Linux/Mac 또는 CONOUT$ 접근 불가 시)
    process.stderr.write(banner);
  }
}
