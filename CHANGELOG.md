# Changelog

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
