# claude-omo

**OMO(oh-my-opencode) 스타일 멀티모델 오케스트레이션 — Claude Code 네이티브 구현 v6.0.2**

GPT / GLM 두 모델을 카테고리 기반으로 자동 라우팅하고,
OMO의 핵심 에이전트 패턴을 Claude Code 프리미티브로 이식한 설정 모음.

**v6.0.2**: 리뷰 후 추가 보강 — ULW/HARD 실제 주입문 runaway guard, 검증 우선 업데이트 스크립트,
allowlist staging, CI 범위 확장, ChatGPT OAuth 기본 인증 체인 제외.

**v6.0.1**: 사용자 피드백 반영 — README/TROUBLESHOOT 라우팅·인증 문서 정합성 수정, `write-guard`
실차단 전환, ULW/HARD 키워드 오탐 방지, 기본 자체 테스트 추가.

**v6.0**: mcp-server를 `providers.json` 기반 플러그인 아키텍처로 전면 리팩토링 — 프로바이더 추가/제거가
코드 수정 없이 가능, ToS 준수 GPT 인증 체인(API 키 → codex CLI, ChatGPT OAuth는 레거시 opt-in), HARD 모드(`/hard`) 신설,
macOS 버그 2건 수정(CONOUT$ 쓰레기파일, install.sh timeout 즉사).

**v5.0**: 에이전트 7→13개, 커맨드 3→11개, 스킬 시스템 신규 추가, OMO 패리티 ~90% 달성.

**v5.1**: OAuth 개선, SSE ReadableStream 파서, quick 카테고리 GLM 전환, MCP 진행 알림(⏳ CALLING).
현재 v6.0+ 기본 라우팅은 `quick → GPT(reasoning none) → GLM fallback`입니다.

**v5.2**: 워크플로 커맨드 2개 추가 — `/finish` (마무리 체크리스트), `/usage` (토큰 사용량 통계).

**v5.2.1**: 업데이트 자동화 — `/update-omo` 커맨드 + `update.bat` (배포+push 원클릭).

**v5.3**: MCP 호출 즉시 진행 표시 (⏳ pre-call-indicator), 에이전트 활동 로그 (activity.log), AbortController 타임아웃.

---

## 설치 (원클릭)

```bash
git clone https://github.com/playljm/claude-omo
cd claude-omo
bash install.sh
```

설치 스크립트가 다음을 자동 처리합니다:
- MCP 서버 설치 (`~/mcp-servers/multi-model/`), `providers.json` 보존/기본값 설치
- 에이전트 13개 + 커맨드 15개 복사 (`~/.claude/`)
- 스킬 3개 복사 (`~/.claude/skills/`)
- CLAUDE.md 설치 (마커 기반 병합, `~/.claude/CLAUDE.md`)
- settings.json 훅 8종 + MCP 등록
- API 키를 Claude MCP env에 등록 (`claude mcp add -e`, 실패 시 settings.json 폴백)
- GPT 인증 상태 확인 및 안내 (API 키 → codex CLI 기본, ChatGPT OAuth는 레거시 opt-in)

이미 설치한 경우 업데이트:
```bash
cd ~/claude-omo && git pull && bash install.sh
```

**Windows에서 편집 후 배포+push:**
```
# 방법 1: 더블클릭
C:\dev\claude-omo\update.bat

# 방법 2: Claude Code 내에서
/update-omo
/update-omo feat: 새 기능 추가   # 커밋 메시지 직접 지정
```

---

## 필요 환경

| 항목 | 내용 |
|------|------|
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` |
| Node.js | 18 이상 |
| GLM_API_KEY | [Z.ai](https://open.bigmodel.cn) 발급 |
| GPT 인증 | `OPENAI_API_KEY`(권장) 또는 `codex` CLI 로그인 |

> **⚠️ Linux 서버 주의**: `export KEY=...` (.bashrc)는 Claude Code MCP 프로세스에 전달되지 않는 경우가 있습니다.
> `install.sh`는 `claude mcp add -e`로 MCP env에 키를 등록합니다. 이 값은 로컬 설정 파일에 남으므로
> 해당 계정 홈 디렉터리 권한을 보호하세요.

---

## GPT 인증 — 서버(브라우저 없는 환경)

GPT 인증은 기본적으로 `providers.json`의 `auth_priority`(`api_key` → `codex_cli`) 순서로 자동 시도됩니다.
권장 순서는 `OPENAI_API_KEY` 또는 서버에서 직접 `codex login`입니다. ChatGPT OAuth(`~/.codex/auth.json`)
직접 호출은 기본 인증 체인에서 제외된 레거시 opt-in 경로입니다.

```bash
# 권장 1: 정식 OpenAI API 키
export OPENAI_API_KEY=sk-...
bash install.sh

# 권장 2: 서버에서 직접 공식 codex CLI 로그인
codex login
```

브라우저가 없는 서버에서는 refresh token 파일 복사 대신 `OPENAI_API_KEY`를 MCP env로 등록하세요.

---

## 모델별 인증 방식

| 모델 | 모델명 | 인증 | 설정 위치 |
|------|--------|------|-----------|
| GPT | `gpt-5.3-codex` | API 키 → codex CLI 순 자동 시도 | `OPENAI_API_KEY` / `codex login` |
| GLM | `glm-5` | API Key | Claude MCP env (`claude mcp add -e`, 실패 시 settings.json 폴백) |

---

## ToS(이용약관) 준수

GPT 프로바이더는 기본적으로 2가지 인증 경로를 `providers.json`의 `auth_priority` 순서대로 자동 시도합니다.
ChatGPT 계정의 OAuth 토큰을 MCP 서버가 직접 호출하는 방식은 이용약관 위반 소지가 있어 기본 인증 체인에서
제외했습니다.

| 우선순위 | 경로 | 방식 | ToS 상태 |
|---------|------|------|----------|
| 1 | `api_key` | `OPENAI_API_KEY` 환경변수 — 정식 OpenAI 플랫폼 API | 문제 없음 (권장) |
| 2 | `codex_cli` | 이미 인증된 `codex` CLI(공식 클라이언트)를 서브프로세스로 경유 | 문제 없음 — 공식 클라이언트를 통한 합법적 사용 |
| 레거시 opt-in | `chatgpt_oauth` | ChatGPT 계정의 OAuth 토큰을 MCP 서버가 직접 호출 | 기본 인증 체인에서 제외. `auth_priority`에 직접 추가하고 `allow_chatgpt_oauth: true`일 때만 사용 |

GLM은 표준 유료 API(Z.ai)를 사용하므로 ToS 문제가 없습니다.

`chatgpt_oauth`는 기존 설치 호환용으로만 남아 있습니다. 새 설치는 1·2번 경로로 커버하세요.

---

## 구조

```
claude-omo/
├── install.sh                   # 원클릭 설치 스크립트
├── CLAUDE.md                    # ~/.claude/CLAUDE.md 라우팅 규칙
├── TROUBLESHOOT.md              # Linux 서버 문제 해결 가이드
├── mcp-server/                  # Multi-Model MCP 서버 v6.0 (providers.json 플러그인 아키텍처)
│   ├── index.js                 # loadProviders, callProvider(kind 3종), smart_route, ask_parallel
│   ├── providers.json           # 프로바이더 정의(gpt/glm) + routing 테이블 [NEW v6.0]
│   ├── ulw-detector.js          # ULW/HARD 모드 훅 (UserPromptSubmit)
│   ├── session-summary.js       # 세션 요약
│   └── hooks/                   # Quality + Activity 훅
│       ├── pre-call-indicator.js  # MCP 호출 시작 즉시 ⏳ 표시 (PreToolUse) [v5.3]
│       ├── post-call-logger.js    # 완료 요약 + activity.log (PostToolUse) [v5.3]
│       ├── comment-checker.js   # AI 슬랭 코멘트 감지 (PostToolUse)
│       ├── write-guard.js       # 기존 파일 Write 덮어쓰기 차단 (PreToolUse)
│       ├── agent-banner.js      # Task 호출 시 에이전트 배너 표시 (PreToolUse) [NEW v6.0]
│       └── routing-display.js   # 라우팅 가시화 (PostToolUse)
├── agents/                      # ~/.claude/agents/ 에 복사 (13개)
│   ├── sisyphus.md              # 멀티에이전트 오케스트레이터 + Intent Gate
│   ├── sisyphus-junior.md       # 집중 실행자 (위임 루프 방지) [NEW]
│   ├── oracle.md                # Opus(최신), 아키텍처 컨설턴트 (읽기전용)
│   ├── prometheus.md            # 인터뷰 모드 전략 플래너 [NEW]
│   ├── atlas.md                 # TodoWrite 오케스트레이터 [NEW]
│   ├── hephaestus.md            # GPT 자율 딥 워커 [NEW]
│   ├── metis.md                 # 계획 빈틈 분석기 [NEW]
│   ├── momus.md                 # 계획 품질 리뷰어 [NEW]
│   ├── researcher.md            # GPT high, 대규모 코드 분석 (읽기전용)
│   ├── worker.md                # GLM + 구현 도구
│   ├── reviewer.md              # ask_parallel 코드 리뷰 (읽기전용)
│   ├── debugger.md              # GPT high, 난해한 버그 진단 (읽기전용)
│   └── explore.md               # Haiku, 빠른 파일 검색 (읽기전용)
├── commands/                    # ~/.claude/commands/ 에 복사 (15개)
│   ├── plan.md                  # /plan — Prometheus 인터뷰 기반 계획
│   ├── route.md                 # /route — smart_route 바로가기
│   ├── compare.md               # /compare — ask_parallel 2모델 비교 (GPT+GLM)
│   ├── ralph-loop.md            # /ralph-loop — 100% 완료까지 자동 루프
│   ├── ulw-loop.md              # /ulw-loop — 최대 강도 ULW 루프
│   ├── handoff.md               # /handoff — 세션 연속성 컨텍스트 저장
│   ├── init-deep.md             # /init-deep — 계층적 AGENTS.md 생성
│   ├── start-work.md            # /start-work — Prometheus 계획 실행
│   ├── refactor.md              # /refactor — LSP+AST-grep 지능형 리팩토링
│   ├── stop-continuation.md     # /stop-continuation — 자동 진행 중지
│   ├── cancel-ralph.md          # /cancel-ralph — Ralph Loop 취소
│   ├── finish.md                # /finish — 작업 마무리 체크리스트 [NEW]
│   ├── usage.md                 # /usage — 외부 모델 토큰 사용량 조회 [NEW]
│   └── hard.md                  # /hard — HARD 모드, 최상위 모델+최대 병렬 [NEW v6.0]
└── skills/                      # ~/.claude/skills/ 에 복사 (NEW v5.0)
    ├── git-master/SKILL.md      # 원자적 커밋, 리베이스, 히스토리 고고학
    ├── frontend-ui-ux/SKILL.md  # 디자이너 출신 개발자 페르소나
    └── playwright/SKILL.md      # 브라우저 자동화
```

---

## 사용법

### ULW (Ultrawork) 모드

```
명시적 트리거: /ulw-loop <작업> 또는 "ulw: <작업>", "ultrawork: <작업>"
→ 시지프스 모드: TodoWrite 강제 + 병렬 에이전트 + 완료 전 종료 불가
```

### HARD 모드 (v6.0 신규)

토큰 절약 정책(Sonnet/Haiku 기본)의 명시적 예외. 되돌리기 힘든 결정·크리티컬한 작업에서만
켜며, 비용은 신경 쓰지 않고 품질만 최대화한다.

```
/hard <작업 설명>
또는 "hardmode: <작업>", "하드모드: <작업>" (ulw-detector가 감지해 자동 주입)
```

5단계 프로토콜: ①ultrathink 3관점 분해(정합성/설계/리스크) + TodoWrite 강제 ②최대 병렬화 +
서브에이전트 모델 제한 해제 ③`smart_route(category="ultrabrain")`(GPT xhigh) + `oracle` 이중 자문 +
`ask_parallel` 교차검증 ④`reviewer` + `momus` 8/10 미만이면 재작업 ⑤Ralph 루프와 동일한 완료 보장
규칙(전체 완료+검증 통과 전 종료 금지). 2회 연속 같은 실패가 반복되면 상태를 보고하고 멈춘다.
중지는 `/stop-continuation`. 토큰/비용 소모가 크므로 일반 작업에는 쓰지 않는다.

### 슬래시 커맨드

| 커맨드 | 설명 |
|--------|------|
| `/plan <기능>` | Prometheus 인터뷰 → 계획 수립 → 실행 |
| `/route <작업>` | smart_route로 최적 모델 자동 선택 |
| `/compare <질문>` | GPT/GLM 2모델 동시 응답 비교 |
| `/ralph-loop` | 100% 완료까지 자동 루프 실행 |
| `/ulw-loop` | 최대 강도 ULW 모드 루프 |
| `/handoff` | 세션 컨텍스트 저장 (다음 세션 연속성) |
| `/init-deep` | 계층적 AGENTS.md 지식베이스 자동 생성 |
| `/start-work` | Prometheus 계획을 Atlas 모드로 실행 |
| `/refactor` | LSP+AST-grep 기반 지능형 리팩토링 |
| `/stop-continuation` | 자동 진행 메커니즘 중지 |
| `/cancel-ralph` | Ralph Loop 취소 |
| `/finish` | 작업 마무리 체크리스트 (검증 → 문서 → 커밋) |
| `/usage [일수]` | 외부 모델(GPT/GLM) 토큰 사용량 통계 |
| `/update-omo [msg]` | claude-omo 변경사항 배포 + GitHub push |
| `/hard <작업>` | HARD 모드 — 최상위 모델 + 최대 병렬 + 이중/교차 검증 [NEW v6.0] |

### 전문 에이전트 (Task 도구)

| 에이전트 | 역할 | 모델 |
|----------|------|------|
| `sisyphus` | 멀티에이전트 오케스트레이터 + Intent Gate | Sonnet |
| `sisyphus-junior` | 집중 실행자 (위임 루프 방지) | Sonnet |
| `oracle` | 아키텍처 컨설턴트 (읽기전용) | Opus(최신) |
| `prometheus` | 인터뷰 모드 전략 플래너 | Sonnet |
| `atlas` | TodoWrite 오케스트레이터 | Sonnet |
| `hephaestus` | 자율 딥 워커 (목표만 주면 스스로 실행) | GPT high |
| `metis` | 계획 빈틈 분석기 (AI 실패 지점 식별) | Sonnet |
| `momus` | 계획 품질 리뷰어 (5기준 0-10점 평가) | Sonnet |
| `researcher` | 대규모 코드 분석 (읽기전용) | GPT high |
| `worker` | CRUD/보일러플레이트 구현 | GLM |
| `reviewer` | 코드 리뷰 (2모델 병렬) | ask_parallel |
| `debugger` | 난해한 버그 진단 (읽기전용) | GPT high |
| `explore` | 빠른 파일 검색 (읽기전용) | Haiku |

### 스킬 시스템 (v5.0 신규)

에이전트가 `load_skills` 파라미터로 전문 스킬을 동적으로 로드합니다.

| 스킬 | 설명 | 트리거 |
|------|------|--------|
| `git-master` | 원자적 커밋, 리베이스/스쿼시, 히스토리 고고학 | `commit`, `rebase`, `blame` |
| `frontend-ui-ux` | 디자이너 출신 개발자 페르소나, 목업 없이도 UI 설계 | React, Vue, CSS, UI/UX |
| `playwright` | 브라우저 자동화, 스크린샷, 웹 테스트 | 브라우저, 크롤링, E2E |

```
task(category="quick", load_skills=["git-master"], ...)
task(category="visual-engineering", load_skills=["frontend-ui-ux", "playwright"], ...)
```

### smart_route 카테고리

| 카테고리 | 트리거 | 모델 |
|----------|--------|------|
| ultrabrain | 아키텍처 설계, 전체 전략 | GPT xhigh |
| deep | 알고리즘, 복잡한 디버깅 | GPT high |
| visual | UI/UX, React/Vue | GPT high |
| research | 코드베이스 전체 분석 | GPT high |
| bulk | CRUD, 보일러플레이트 | GLM |
| writing | 문서, README | GLM |
| quick | 단순 변환, 포맷팅 | GPT none → GLM fallback |

---

## MCP 도구 목록

`ask_<provider>` 도구는 `providers.json`의 `enabled: true`인 프로바이더마다 서버 기동 시 동적으로
생성됩니다 (v6.0). 프로바이더를 추가/제거하면 코드 수정 없이 툴 목록이 함께 바뀝니다.

| 도구 | 설명 |
|------|------|
| `smart_route` | 카테고리 자동 분류 + 최적 모델 라우팅 + 폴백 (disabled 프로바이더는 자동 스킵) |
| `ask_parallel` | `parallel_default` ∩ enabled 모델 동시 호출 (Promise.allSettled) |
| `ask_gpt` | `ask_<provider>` 동적 생성 예시 — GPT Responses API (reasoning_effort 지원) |
| `ask_glm` | `ask_<provider>` 동적 생성 예시 — GLM Chat Completions (max_tokens, temperature) |
| `get_usage_stats` | 모델별 토큰 사용량 통계 |

---

## 모델 추가/제거 (providers.json)

`mcp-server/providers.json`에 프로바이더 블록을 추가/수정하면 **코드 수정 없이** `ask_<name>` 툴이
생기거나 사라집니다. 실제 스키마는 아래와 같습니다.

| 필드 | 설명 |
|------|------|
| `kind` | `openai-responses`(GPT류 Responses API) / `openai-chat`(OpenAI 호환 Chat Completions — GLM 포함 대부분의 서비스) / `cli`(공식 CLI 서브프로세스 실행) |
| `enabled` | `false`로 두면 해당 `ask_<name>` 툴이 생성되지 않고 라우팅/병렬 호출에서도 제외 |
| `base_url` | API 엔드포인트 |
| `auth.api_key_env` | API 키를 읽을 환경변수명. 비어있고 `base_url`이 localhost면 무인증 허용(Ollama 등) |
| `auth.auth_priority` | GPT처럼 인증 경로가 여럿일 때 시도 순서. 기본값은 `api_key`/`codex_cli`, `chatgpt_oauth`는 레거시 opt-in |
| `default_model` / `models` | 기본 모델 및 선택 가능한 모델 목록(enum) |
| `supports_reasoning_effort` / `supports_temperature` | 툴 파라미터에 해당 옵션을 조건부로 추가 |
| `routing` | `smart_route`가 쓰는 카테고리별 provider/effort/fallback 테이블 |
| `parallel_default` | `ask_parallel`이 인자 생략 시 기본으로 호출할 프로바이더 목록 |

**DeepSeek 추가 예시** (`openai-chat`, 코드 수정 없이 바로 동작):
```json
"deepseek": {
  "enabled": true,
  "label": "DeepSeek",
  "kind": "openai-chat",
  "base_url": "https://api.deepseek.com/v1",
  "auth": { "api_key_env": "DEEPSEEK_API_KEY" },
  "default_model": "deepseek-chat",
  "models": ["deepseek-chat", "deepseek-reasoner"],
  "supports_temperature": true,
  "description": "DeepSeek Chat Completions"
}
```

**Ollama(로컬, 무인증) 추가 예시**:
```json
"ollama": {
  "enabled": true,
  "label": "Ollama",
  "kind": "openai-chat",
  "base_url": "http://localhost:11434/v1",
  "auth": { "api_key_env": "" },
  "default_model": "llama3.1",
  "models": ["llama3.1"],
  "description": "로컬 Ollama — API 키 불필요"
}
```

**제거**: 블록을 지우지 말고 `"enabled": false` 한 줄로 비활성화 (롤백 용이).

변경 후에는 Claude Code를 재시작해야 MCP 서버 프로세스가 재기동되어 반영됩니다.
`providers.json`이 없거나 손상되었거나 `schema_version`이 지원 범위 밖이면 stderr 경고를 출력하고
내장된 기본값(gpt+glm)으로 폴백하므로 서버가 죽지 않습니다.

---

## Quality & Activity Hooks (v6.0 — install.sh가 8종 전부 등록)

| 훅 | 타입 | 설명 |
|----|------|------|
| `comment-checker` | PostToolUse | AI 슬랭("이 함수는", "중요:", "주의:") 코멘트 감지 및 경고 (Edit `new_string` 포함 전체 본문 추출) |
| `write-guard` | PreToolUse | 기존 파일을 `Write`로 덮어쓰는 호출을 차단하고 `Edit` 사용을 요구. `OMO_WRITE_GUARD_MODE=warn`이면 경고만 출력 |
| `routing-display` | PostToolUse — 활성 | 외부 모델 호출 후 라우팅 정보 표시 (카테고리·모델·이유·폴백 여부) |
| `pre-call-indicator` | PreToolUse | MCP 호출 시작 즉시 `⏳ 🧠 GPT [deep] — 14:23:05 호출 시작` 표시, 호출별 상태를 맵으로 관리해 동시 호출 레이스 완화 |
| `post-call-logger` | PostToolUse | 완료 후 `✅ GPT [deep] — 34.5s` + `activity.log` JSONL 기록 |
| `agent-banner` | PreToolUse (matcher: Task) | 서브에이전트 호출 시 종류별 배너 표시 (macOS/Linux stderr, Windows CONOUT$) [NEW v6.0] |
| `ulw-detector` | UserPromptSubmit | 명시적 ULW/HARD 트리거 감지 후 프로토콜 주입 |
| `session-summary` | SessionEnd | 세션 요약 |

---

## 상태 확인

```bash
# MCP 등록 확인 (이게 비어있으면 /compare 등 동작 안 함)
claude mcp list
claude mcp get multi-model-agent

# API 키 확인
python3 -c "
import json, os, pathlib, subprocess
result = subprocess.run(['claude', 'mcp', 'get', 'multi-model-agent'], capture_output=True, text=True)
print('MCP 등록:', '✅' if 'multi-model-agent' in result.stdout else '❌ 미등록')
env = {}
for path in [pathlib.Path.home()/'.claude.json', pathlib.Path.home()/'.claude/settings.json']:
    try:
        data = json.loads(path.read_text())
        env.update(data.get('mcpServers',{}).get('multi-model-agent',{}).get('env',{}))
    except Exception:
        pass
print('GLM_API_KEY:   ', '✅' if env.get('GLM_API_KEY') else '❌ 없음')
print('OPENAI_API_KEY:', '✅' if env.get('OPENAI_API_KEY') else '❌ 없음 (codex CLI로 폴백)')
"

# Legacy GPT auth — chatgpt_oauth를 명시 opt-in 했을 때만 참고
python3 -c "
import json
d = json.load(open('$HOME/.codex/auth.json'))
t = d.get('tokens', d)
print('access_token: ', '✅' if t.get('access_token') else '❌')
print('refresh_token:', '✅' if t.get('refresh_token') else '❌ (만료 시 재로그인 필요)')
" 2>/dev/null || echo "auth.json 없음 — GPT는 OPENAI_API_KEY 또는 codex CLI 경로 사용"
```

문제가 있으면 → **[TROUBLESHOOT.md](./TROUBLESHOOT.md)**

---

## OMO 대응표

| OMO | claude-omo v6.0 | 비고 |
|-----|----------------|------|
| Sisyphus (오케스트레이터) | `sisyphus` + `sisyphus-junior` | Intent Gate 추가 |
| Oracle (아키텍처 컨설턴트) | `oracle` | Opus(최신) |
| Hephaestus (자율 딥 워커) | `hephaestus` | Claude subagent가 도구를 실행하고 GPT high는 텍스트 자문으로 사용 |
| Prometheus (전략 플래너) | `prometheus` + `/plan`, `/start-work` | 인터뷰 모드 |
| Atlas (실행 오케스트레이터) | `atlas` | TodoWrite 기반 |
| Metis (계획 분석) | `metis` | AI 실패 지점 식별 |
| Momus (품질 리뷰어) | `momus` | 5기준 0-10점 평가 |
| Librarian (문서 검색) | `researcher` | GPT high |
| Explore (빠른 검색) | `explore` | Haiku |
| Reviewer (코드 리뷰) | `reviewer` | ask_parallel (GPT+GLM) |
| Debugger | `debugger` | GPT high |
| Intent Gate + Categories | `smart_route` MCP | providers.json `routing` 테이블 기반 |
| ask_parallel | `ask_parallel` MCP | — |
| Ralph Loop | `/ralph-loop`, `/ulw-loop` | 자동 루프 커맨드 |
| (신규) 품질 최우선 모드 | `/hard` | HARD 모드, OMO에 없는 claude-omo 자체 확장 [NEW v6.0] |
| Handoff | `/handoff` | 세션 연속성 |
| Skill System | `skills/` 디렉토리 | git-master, frontend-ui-ux, playwright |
| Activity Hooks | `hooks/` 디렉토리 | pre-call-indicator, post-call-logger, agent-banner [NEW v6.0], comment-checker, write-guard(blocking) |
