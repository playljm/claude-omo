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
  console.log(`
╔══════════════════════════════════════╗
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
6. 완료 선언은 모든 TodoWrite 항목 체크 후에만 가능
`.trim());
}
