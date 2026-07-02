# Changelog

## [6.0.3] - 2026-07-02

### Added - authentication setup UX

- **`auth-setup.js`**: API 키와 GPT 인증 상태를 설치와 분리해 확인·재설정하는 대화형 CLI 추가. 숨김 입력, `Enter=유지`, `-=삭제`, `--status`, `--apply-env` 지원
- **`/auth-setup` 커맨드**: Claude Code 안에서 인증 재설정 방법을 바로 찾을 수 있는 커맨드 문서 추가
- **설치 보안 개선**: `install.sh` 키 입력을 숨김 처리하고, 키를 `claude mcp add -e` argv로 넘기지 않도록 변경. MCP 등록 후 `auth-setup.js`가 설정 파일에 env를 저장
- **테스트**: `auth-setup.js`가 설정 파일에는 키를 저장하지만 stdout에는 실제 키 값을 출력하지 않는 회귀 테스트 추가

## [6.0.2] - 2026-07-02

### Fixed - review follow-up hardening

- **ULW/HARD runaway guard**: `ulw-detector.js`가 실제로 주입하는 ULW/HARD 지시문에 반복 검증 실패, 외부 모델 실패, 사용자 결정 blocker 2회 반복 시 중단·보고 규칙 추가
- **업데이트 안전성**: `/update-omo`와 `update.bat`을 검증 우선 순서로 변경해 테스트 실패 전에는 프로젝트/글로벌 `.claude`를 덮어쓰지 않음
- **Git staging 제한**: 업데이트 자동화의 `git add -A` 제거, 레포 소스 allowlist만 stage하도록 변경
- **CI 범위 확장**: GitHub Actions가 `install.sh`, `commands/**`, `agents/**`, `skills/**`, 문서, `update.bat` 변경에도 실행되도록 확대하고 release-surface smoke 검증 추가
- **인증 정책 강화**: 기본 GPT 인증 체인에서 `chatgpt_oauth` 제거. `OPENAI_API_KEY` → `codex_cli`만 기본 시도하고 ChatGPT OAuth 직접 호출은 레거시 opt-in으로 분리

## [6.0.1] - 2026-07-02

### Fixed - feedback hardening

- **문서 정합성**: README/TROUBLESHOOT의 quick 라우팅과 GPT 인증 안내를 현재 v6 코드 기준으로 수정
- **인증 안내 보안**: root 계정 auth.json 복사, 토큰 원문 붙여넣기, 수동 토큰 파일 생성 안내 제거. `OPENAI_API_KEY` 또는 서버 직접 `codex login`을 우선 안내
- **`write-guard.js`**: 기존 파일 `Write` 호출을 실제 PreToolUse deny로 차단. `OMO_WRITE_GUARD_MODE=warn`일 때만 legacy advisory 모드 사용
- **`ulw-detector.js`**: `ulw`/`hardmode` 단순 언급으로 고비용 루프가 켜지지 않도록 명시적 트리거(`ulw:`, `/ulw-loop`, `hardmode:`, `/hard`)만 허용
- **테스트**: `node --test` 기반 safety 테스트 추가. write-guard 차단, ULW/HARD 오탐 방지, quick 라우팅 selftest 검증
- **배포 안전장치**: `/update-omo`, `update.bat`, GitHub Actions에 `npm test`/`selftest`/`npm audit` 게이트 추가

## [6.0.0] - 2026-07-02

### Added - providers.json 플러그인 아키텍처 + HARD 모드

#### mcp-server 플러그인화
- **`providers.json`** (신규): 프로바이더 정의(gpt/glm) + `routing` 테이블 + `parallel_default`를 코드와 분리 관리. `kind: "openai-responses" | "openai-chat" | "cli"` 3종을 지원해, 새 프로바이더를 등록하면 코드 수정 없이 `ask_<name>` 툴이 생성됨
- **`buildToolDefinitions()`**: enabled 프로바이더마다 `ask_<name>` 동적 생성 (model enum, `supports_reasoning_effort`/`supports_temperature` 플래그로 파라미터 조건부 추가). 기존 `ask_gpt`/`ask_glm` 이름·파라미터는 하위 호환 유지
- **`loadProviders()`**: providers.json 파일 없음/파싱 실패/`schema_version` 불일치 시 stderr 경고 후 내장 `DEFAULT_PROVIDERS_CONFIG`로 폴백 — MCP 서버가 죽지 않음
- **`--selftest`** 플래그: `@modelcontextprotocol/sdk` 정적 임포트 없이(모든 sdk 임포트를 `main()` 내부 동적 import로 이동) providers.json 로드 결과(enabled 목록, 프로바이더별 인증 상태, 생성될 툴 이름, routing 테이블)를 JSON으로 출력 후 종료 — `node_modules` 없이도 동작 확인 가능

#### HARD 모드
- **`commands/hard.md`** (신규): `/hard <작업>` 커맨드 — 토큰 절약 정책의 명시적 예외. 5단계 프로토콜(①ultrathink 정합성/설계/리스크 3관점 분해+TodoWrite 강제 ②최대 병렬화+서브에이전트 모델 제한 해제 ③`smart_route(ultrabrain, xhigh)`+`oracle` 이중 자문+`ask_parallel` 교차검증 ④`reviewer`+`momus` 8/10 미만 재작업 ⑤Ralph 루프와 동일한 완료 보장)
- **`ulw-detector.js`**: `hardmode`/`하드모드` 키워드 정규식 추가 — 감지 시 HARD 모드 프로토콜을 additionalContext로 주입 + 배너 출력. ULW와 동시 매치 시 HARD 우선

#### install.sh
- 누락된 훅 2종 등록: `routing-display.js`(PostToolUse, matcher `mcp__multi-model-agent`), `agent-banner.js`(PreToolUse, matcher `Task`) — `upsert_matcher_hook`으로 idempotent 등록
- CLAUDE.md `<!-- OMO:START/END -->` 마커 기반 병합 — 마커가 있으면 그 블록만 레포 버전으로 교체, 없으면 기존 내용 보존+append. 인터랙티브 y/N 덮어쓰기 프롬프트 폐지(항상 백업 후 병합)
- `PROTECTED_COMMANDS=("finish.md")` 배열 도입 — 로컬에 이미 존재하고 레포 버전과 내용이 다른 보호 대상 커맨드는 복사 스킵 + 안내 출력
- macOS에서 `providers.json`을 백업→복사→복원 방식으로 보존(신규 설치 시엔 레포 기본값 설치), 완료 배너의 슬래시 커맨드 목록을 `commands/*.md` frontmatter에서 동적 생성

### Changed - 인증 체인 ToS 준수 + 라우팅 동적화

- **GPT 인증 체인**(`resolveGptAuth()`): `auth_priority`(`api_key` → `codex_cli` → `chatgpt_oauth`) 순서로 자동 시도. `codex_cli`는 `codex --version` 1회 캐시 확인 후 `codex exec` 서브프로세스 실행. `chatgpt_oauth`는 `allow_chatgpt_oauth: true`일 때만, 최초 1회 stderr ToS 경고 출력 후 사용 — 3가지 모두 실패 시 대안을 안내하는 에러 발생
- **버전 관리 단일화**: mcp-server 버전을 `package.json`에서 `readFileSync`로 읽어 사용 (하드코딩 제거), `package.json` 버전을 `6.0.0`으로 갱신
- **`ask_parallel`**: `parallel_default` ∩ enabled 프로바이더로 호출 대상 결정, `models` 파라미터 enum도 enabled 프로바이더 기준으로 동적 생성
- **`smart_route`**: `CATEGORY_ROUTING`이 providers.json의 `routing` 테이블을 사용하도록 변경 — primary 프로바이더가 disabled면 fallback 체인에서 첫 enabled로 자동 대체(`(xxx disabled)` 표기), 전부 disabled면 명확한 에러
- **`last-call.json`** 메타 기록 일반화: 하드코딩된 모델명 매핑 제거, `providers.providers[name]?.default_model`로 대체

### Fixed - macOS 버그 2건 + 레이스/오탐 4건

- **CONOUT$ 쓰레기파일** (`ulw-detector.js`, `hooks/agent-banner.js`): `process.platform === "win32"`일 때만 `\\.\CONOUT$` 오픈을 시도하도록 변경 — macOS/Linux는 바로 stderr로 출력해 홈 디렉터리에 `\\.\CONOUT$` 파일이 생기던 문제 해소
- **install.sh macOS timeout 즉사**: `find_python()`에서 `timeout`/`gtimeout` 존재 여부를 먼저 확인하고, 둘 다 없으면 래핑 없이 python을 직접 실행 — macOS에서 python3 탐지가 항상 실패하던 문제 수정
- **재설치 시 API 키 유실**: `~/.claude.json`(`claude mcp add --scope user` 정식 등록 경로)을 우선 확인하고 없으면 `~/.claude/settings.json`으로 폴백하도록 `GLM_API_KEY`/`OPENAI_API_KEY` 복원 로직 재작성
- **`comment-checker.js` Edit no-op**: 본문 추출 폴백 체인에 `tool_input.new_string`이 누락되어 Edit 도구 호출 시 항상 빈 문자열로 처리되던 문제 수정
- **ULW 정규식 오탐**: `/(^|[^-\w])(ulw|ultrawork)(?=[^-\w]|$)/i`로 교체 — `ulw-detector.js` 같은 파일명이 ULW 모드로 오인식되던 문제 해소
- **공유 상태파일 레이스** (`pre-call-indicator.js` + `post-call-logger.js`): `pre-call-state.json`을 단일 오브젝트에서 `{tool:hash}` 키 맵으로 변경해 동시 MCP 호출 간 상태 덮어쓰기/유실 완화, 60초 경과 엔트리 자동 정리

---

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
- **`commands/finish.md`**: private 서버 IP 및 JARVIS 섹션 제거 (공개 레포 정리)

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
