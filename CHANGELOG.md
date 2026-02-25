# Changelog

## [5.3.2] - 2026-02-25

### Fixed - 성능 개선 및 시각적 출력 품질 향상

#### 중복 출력 제거 (Critical)
- **`post-call-logger.js` + `routing-display.js` 중복 출력 제거**: 동일 PostToolUse에 두 훅이 등록되어 같은 정보가 두 번 출력되던 문제 수정
  - `post-call-logger.js`: 터미널 출력 제거, activity.log 기록 전용으로 역할 분리
  - `routing-display.js`: 경과시간(`elapsed_ms`) 추가하여 원스톱 시각 출력 담당

#### 시각적 개선
- **`pre-call-indicator.js`**: `console.log` → `process.stderr.write` 변경 — PreToolUse stdout이 Claude 컨텍스트에 주입되는 부작용 방지
- **`routing-display.js`**: 박스 너비 고정(`BOX_WIDTH = 58`) — 이모지 폭 계산 오류로 상/하단 줄 길이 불일치 수정
- **`session-summary.js`**: 모델명 축약 (`gpt-5.3-codex` → `GPT`, `glm-5` → `GLM`)
- **`routing-pre-display.js`** 삭제 — 미등록 legacy 파일, Gemini 잔재 포함

#### 성능 개선
- **`index.js`**: reasoning_effort별 동적 타임아웃 (`none` 30s / `low` 45s / `medium` 60s / `high` 90s / `xhigh` 120s) — 단순 호출이 불필요하게 120s까지 대기하던 문제 해소
- **`index.js`**: `last-call.json` 쓰기를 `writeFileSync` → `writeFile`(비동기)로 변경 — 이벤트 루프 차단 제거
- **`post-call-logger.js` + `routing-display.js`**: 신뢰 윈도우 10초 → 30초 — xhigh reasoning 후 훅 딜레이로 `unknown` 표시되던 문제 해소

#### 코드 품질
- **`comment-checker.js`**: `process.stdin.on("data")` → `for await` 패턴으로 통일 (다른 훅과 일관성)

---

## [5.3.1] - 2026-02-25

### Fixed - Gemini 제거 정합성 수정 및 문서 클린업

#### 버그 수정 (Critical)
- **`researcher.md` 동작 불가**: `ask_gemini` MCP 툴이 존재하지 않음에도 tools frontmatter에 등록되어 에이전트 호출 시 "알 수 없는 툴" 오류 발생 → `ask_gpt(high)`로 교체
- **`sisyphus.md` / `sisyphus-junior.md`**: tools frontmatter에서 `ask_gemini` 제거
- **`reviewer.md`**: `models=["gpt","gemini","glm"]` → `["gpt","glm"]` 수정 (gemini 호출 시 실패)

#### 문서 정합성 수정
- **`README.md`**: 라우팅 테이블 `visual`/`research` → Gemini(오류) → GPT high(정확), 에이전트/MCP 도구 테이블 전체 현실 반영
- **`CLAUDE.md`**: `oracle` 모델 설명 "GPT xhigh" → "Claude Opus 4.6" (oracle은 MCP 미사용, Opus 서브에이전트)
- **`commands/compare.md`**: "GPT/Gemini/GLM 3모델" → "GPT/GLM 2모델"
- **`mcp-server/index.js`**: 서버 버전 `4.0.0` → `5.3.0`

#### 커맨드 개선
- **`commands/refactor.md`**: 존재하지 않는 LSP 도구(`lsp_find_references`, `lsp_rename`, `ast_grep_*`) → Claude Code 네이티브 도구(Grep, Edit, Bash)로 전면 재작성
- **`commands/finish.md`**: private 서버 IP(100.70.193.60) 및 JARVIS 섹션 제거 (공개 레포 정리)

#### 설치 스크립트
- **`install.sh`**: GEMINI_API_KEY 수집/주입 로직 완전 제거, 커맨드 수 13→14 수정

---

## [5.3.0] - 2026-02-25

### Fixed - 훅 등록 버그 수정 및 모델 가시성 개선

#### 버그 수정 (Critical)
- **`pre-call-indicator.js` 미등록**: `settings.json`에 PreToolUse 훅이 등록되지 않아 모델 호출 전 표시가 전혀 없던 문제 수정
- **`routing-display.js` dead code**: `last-route.json`(존재하지 않음)을 읽어 항상 조기 종료하던 문제 → `last-call.json` 기반으로 전체 재작성

#### 개선 - 모델 가시성
- **`post-call-logger.js`**: reasoning_effort 표시 추가 → `✅ GPT [deep] (high) — 34.5s`
- **`routing-display.js`**: Windows 호환 stdin 처리(for await), 업데이트된 모델명(GLM-5), Gemini 잔재 제거
- **`ask_parallel`**: `reasoning_effort` 파라미터 추가 (기존 hardcoded medium → 설정 가능)

#### settings.json 훅 구조
```
PreToolUse  [mcp__multi-model-agent] → pre-call-indicator.js  (신규 등록)
PostToolUse [mcp__multi-model-agent] → post-call-logger.js    (신규 등록)
                                     → routing-display.js     (수정됨)
```

---

## [5.2.1] - 2026-02-25

### Added - 업데이트 자동화

- **update.bat**: Windows 더블클릭으로 sync + GitHub push (agents/commands/skills/CLAUDE.md → C:\dev\.claude\ + ~/.claude/ 동기화)
- **/update-omo** 커맨드: Claude Code 내에서 직접 배포 + push 실행

---

## [5.2.0] - 2026-02-25

### Added - 워크플로 커맨드 2개 추가

#### 커맨드 (11 -> 13)
- **/finish** (v2.1): 작업 마무리 체크리스트 — 검증 → 변경사항 요약 → 문서 업데이트 → git 커밋/푸시 단계별 안내
- **/usage** (v1.0): 외부 모델(GPT/Gemini/GLM) 토큰 사용량 통계 조회 — `~/mcp-servers/multi-model/usage-log.jsonl` 파싱, 최근 N일 기간 지정 가능

---

## [5.1.0] - 2026-02-24

### Changed - OAuth, SSE, Routing, Progress

#### OAuth 개선 (P3)
- `api.responses.write` 스코프 체크 완전 제거 → `auth_mode` 기반 라우팅으로 대체
- `auth_mode: 'chatgpt'`면 `chatgpt.com/backend-api/codex/responses` 사용 (Codex CLI 공식 엔드포인트)
- `CODEX_CLIENT_ID` 하드코딩: `app_EMoamEEZ73f0CkXaXp7hrann` (@openai/codex 공식 OAuth client_id)
- `doRefreshToken` 스코프: `openid profile email` (Codex CLI 동일)

#### SSE 파서 개선 (P3)
- `res.text()` 전체 버퍼링 → `body.getReader()` ReadableStream 청크 방식
- 누락된 청크 경계 처리: `buffer`에 부분 라인 누적, `\n` 구분 시정
- `response.output_text.delta` delta 우선 조합, `response.completed` 폴백

#### 라우팅 개선 (P2)
- `quick` 카테고리: GPT(none) → **GLM** 우선 (GLM → GPT 폴백)
- 미분류 기본값: `deep`(GPT high) → **`quick`**(GLM) — 불필요한 GPT 호출 감소

#### 진행 알림 (P1)
- `sendProgress` 헬퍼: MCP ProgressNotification으로 실시간 구현
- 모든 도구(smart_route, ask_gpt, ask_gemini, ask_glm, ask_parallel)에 호출 시작/완료 알림
- `routing-pre-display.js` PreToolUse 훅 신규: 도구 실행 전 `⏳ CALLING ...` 메시지 표시


## [5.0.0] - 2026-02-24

### Added - OMO Parity Update

#### Agents (7 -> 13)
- **hephaestus**: GPT autonomous deep worker. Goal-only input, self-directed codebase research+implementation
- **prometheus**: Interview-mode strategic planner. Saves plans to `.claude/plans/`
- **atlas**: TodoWrite orchestrator. Executes Prometheus plans with learning accumulation
- **metis**: Plan gap analyzer. Identifies AI failure points, ambiguities, missing edge cases
- **momus**: Plan reviewer. 5-criteria scoring (Clarity/Verifiability/Completeness/Ordering/Risk) 0-10
- **sisyphus-junior**: Focused executor. Prevents delegation loops, direct execution only
- **Sisyphus enhanced**: Added Intent Gate for proper intent classification before action

#### Commands (3 -> 11)
- **/ralph-loop**: Self-referential completion loop until 100% done (core OMO feature)
- **/ulw-loop**: Maximum intensity ULW + parallel agents
- **/handoff**: Save context summary for session continuity
- **/init-deep**: Auto-generate hierarchical AGENTS.md throughout project
- **/start-work**: Start executing Prometheus plan (Atlas mode)
- **/refactor**: Intelligent refactoring with LSP+AST-grep+TDD verification
- **/stop-continuation**, **/cancel-ralph**: Safety control commands

#### Skills System (new)
- **git-master**: Atomic commits, rebase surgery, history archaeology. `~/.claude/skills/git-master/SKILL.md`
- **frontend-ui-ux**: Designer-dev persona for stunning UI. `~/.claude/skills/frontend-ui-ux/SKILL.md`
- **playwright**: Browser automation skill. `~/.claude/skills/playwright/SKILL.md`

#### Quality Hooks
- **comment-checker**: Detects AI slop comments (`PostToolUse` -> Write/Edit)
- **write-guard**: Prevents accidental overwrites (`PreToolUse` -> Write)

---

## [4.1.0] - 2026-02-24

### Fixed
- **GPT OAuth 인증 개선**: `api.responses.write` 스코프 없는 ChatGPT Plus/Pro OAuth 토큰 문제 해결
  - 기존: `isOAuthOnly = true` → `api.openai.com/v1/chat/completions` 폴백 → HTTP 429 실패
  - 이후: `chatgpt.com/backend-api/codex/responses` 직접 호출로 GPT-5.3-Codex 정상 동작
  - `getJwtAuthClaim()` 헬퍼 추가: JWT에서 `chatgpt_account_id` 추출
  - SSE 스트림 파싱 추가 (`response.completed` → `output_text`, delta fallback)
- **TROUBLESHOOT.md 섹션 8**: OPENAI_API_KEY 발급 요구 → Codex 백엔드 작동 원리 설명으로 교체

### Changed
- GPT 인증 우선순위 정리 (코드/문서 일치):
  1. `OPENAI_API_KEY` 환경변수 → `api.openai.com/v1/responses`
  2. `auth.json`의 `OPENAI_API_KEY` → `api.openai.com/v1/responses`
  3. ChatGPT OAuth (자동) → `chatgpt.com/backend-api/codex/responses`

---

## [4.0.0] - 2026-02

### Added
- `fetchWithRetry`: 429/500/502/503/529 → 최대 3회 재시도, 지수 백오프
- `smart_route`: 카테고리 기반 자동 라우팅 + 폴백 체인
- `ask_parallel`: Promise.allSettled() 다중 모델 동시 호출
- 확장 파라미터: `max_tokens`, `temperature` (Gemini/GLM), `max_tokens` (GPT)
- 강화 로깅: `category`, `retry_count`, `routing` 필드

### Fixed
- GLM 기본 모델 `glm-5`(유료) → `glm-4.7-flash`(무료)로 변경
- Windows MSYS python3 Store stub 행 문제 수정
- GPT `callGpt` isOAuthOnly 반환값 수정 및 401 scope 에러 시 Chat Completions 자동 폴백
