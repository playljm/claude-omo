# claude-omo

**OMO(oh-my-opencode) 스타일 멀티모델 오케스트레이션 — Claude Code 네이티브 구현**

GPT / Gemini / GLM 세 모델을 카테고리 기반으로 자동 라우팅하고,
OMO의 핵심 에이전트 패턴(Sisyphus, Oracle, Explore 등)을 Claude Code 프리미티브로 이식한 설정 모음.

---

## 설치 (원클릭)

```bash
git clone https://github.com/playljm/claude-omo
cd claude-omo
bash install.sh
```

설치 스크립트가 다음을 자동 처리합니다:
- MCP 서버 설치 (`~/mcp-servers/multi-model/`)
- 에이전트 7개 + 커맨드 복사 (`~/.claude/`)
- CLAUDE.md 설치 (`~/.claude/CLAUDE.md`)
- settings.json 훅 + MCP 등록
- **API 키를 settings.json env에 직접 주입** (Linux MCP 전달 문제 해결)
- GPT auth.json 상태 확인 및 안내

이미 설치한 경우 업데이트:
```bash
cd ~/claude-omo && git pull && bash install.sh
```

---

## 필요 환경

| 항목 | 내용 |
|------|------|
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` |
| Node.js | 18 이상 |
| GEMINI_API_KEY | [AI Studio](https://aistudio.google.com/apikey) 발급 |
| GLM_API_KEY | [Z.ai](https://open.bigmodel.cn) 발급 |
| GPT 인증 | `~/.codex/auth.json` (아래 참고) |

> **⚠️ Linux 서버 주의**: `export KEY=...` (.bashrc)는 Claude Code MCP 프로세스에 전달되지 않습니다.
> `install.sh`가 API 키를 `settings.json`의 `mcpServers.env`에 직접 주입합니다.

---

## GPT 인증 — 서버(브라우저 없는 환경)

GPT는 OAuth 방식(`~/.codex/auth.json`)을 사용합니다.
브라우저가 없는 서버에서는 다른 머신에서 파일을 복사합니다.

```bash
# Windows/Mac에서 codex login 완료 후 서버로 복사
scp ~/.codex/auth.json root@<서버IP>:~/.codex/auth.json

# 또는 install.sh 실행 중 붙여넣기 옵션 선택
```

auth.json 구조:
```json
{
  "auth_mode": "chatgpt",
  "tokens": {
    "access_token": "...",
    "refresh_token": "..."
  }
}
```

`refresh_token`이 있으면 만료 시 자동 갱신됩니다.

---

## 모델별 인증 방식

| 모델 | 모델명 | 인증 | 설정 위치 |
|------|--------|------|-----------|
| GPT | `gpt-5.3-codex` | OAuth JWT | `~/.codex/auth.json` |
| Gemini | `gemini-2.5-pro` | API Key | `settings.json mcpServers.env` |
| GLM | `glm-5` | API Key | `settings.json mcpServers.env` |

---

## 상태 확인

```bash
# MCP 등록 확인 (이게 비어있으면 /compare 등 동작 안 함)
claude mcp list
claude mcp get multi-model-agent

# API 키 확인
python3 -c "
import json, subprocess, sys
result = subprocess.run(['claude', 'mcp', 'get', 'multi-model-agent'], capture_output=True, text=True)
print('MCP 등록:', '✅' if 'multi-model-agent' in result.stdout else '❌ 미등록')
s = json.load(open('$HOME/.claude/settings.json'))
env = s.get('mcpServers',{}).get('multi-model-agent',{}).get('env',{})
print('GEMINI_API_KEY:', '✅' if env.get('GEMINI_API_KEY') else '❌ 없음')
print('GLM_API_KEY:   ', '✅' if env.get('GLM_API_KEY') else '❌ 없음')
"

# GPT auth
python3 -c "
import json
d = json.load(open('$HOME/.codex/auth.json'))
t = d.get('tokens', d)
print('access_token: ', '✅' if t.get('access_token') else '❌')
print('refresh_token:', '✅' if t.get('refresh_token') else '❌ (만료 시 재로그인 필요)')
" 2>/dev/null || echo "auth.json 없음 — GPT 사용 불가"
```

문제가 있으면 → **[TROUBLESHOOT.md](./TROUBLESHOOT.md)**

---

## 구조

```
claude-omo/
├── install.sh           # 원클릭 설치 스크립트
├── TROUBLESHOOT.md      # Linux 서버 문제 해결 가이드
├── mcp-server/          # Multi-Model MCP 서버 v4.0
│   ├── index.js         # smart_route, ask_parallel, fetchWithRetry
│   ├── ulw-detector.js  # ULW 모드 훅 (UserPromptSubmit)
│   └── session-summary.js
├── agents/              # ~/.claude/agents/ 에 복사
│   ├── sisyphus.md      # 멀티에이전트 오케스트레이터 (ULW)
│   ├── oracle.md        # GPT high, 아키텍처 컨설턴트 (읽기전용)
│   ├── researcher.md    # Gemini, 대규모 코드 분석 (읽기전용)
│   ├── worker.md        # GLM + 구현 도구
│   ├── reviewer.md      # ask_parallel 코드 리뷰 (읽기전용)
│   ├── debugger.md      # GPT high, 난해한 버그 진단 (읽기전용)
│   └── explore.md       # Haiku, 빠른 파일 검색 (읽기전용)
├── commands/            # ~/.claude/commands/ 에 복사
│   ├── plan.md          # /plan — Prometheus 인터뷰 기반 계획
│   ├── route.md         # /route — smart_route 바로가기
│   └── compare.md       # /compare — ask_parallel 3모델 비교
└── CLAUDE.md            # ~/.claude/CLAUDE.md 라우팅 규칙
```

---

## 사용법

### ULW (Ultrawork) 모드

```
메시지에 ulw 또는 ultrawork 키워드 포함
→ 시지프스 모드: TodoWrite 강제 + 병렬 에이전트 + 완료 전 종료 불가
```

### 슬래시 커맨드

| 커맨드 | 설명 |
|--------|------|
| `/route <작업>` | smart_route로 최적 모델 자동 선택 |
| `/compare <질문>` | GPT/Gemini/GLM 3모델 동시 응답 비교 |
| `/plan <기능>` | Prometheus 인터뷰 → 계획 수립 → 실행 |

### 전문 에이전트 (Task 도구)

| 에이전트 | 역할 | 모델 |
|----------|------|------|
| `sisyphus` | 멀티에이전트 오케스트레이터 | Sonnet |
| `oracle` | 아키텍처 컨설턴트 (읽기전용) | Opus 4.6 |
| `debugger` | 난해한 버그 진단 (읽기전용) | GPT high |
| `researcher` | 대규모 코드 분석 | Gemini |
| `worker` | CRUD/보일러플레이트 구현 | GLM |
| `reviewer` | 코드 리뷰 (3모델 병렬) | ask_parallel |
| `explore` | 빠른 파일 검색 | Haiku |

### smart_route 카테고리

| 카테고리 | 트리거 | 모델 |
|----------|--------|------|
| ultrabrain | 아키텍처 설계, 전체 전략 | GPT xhigh |
| deep | 알고리즘, 복잡한 디버깅 | GPT high |
| visual | UI/UX, React/Vue | Gemini |
| research | 코드베이스 전체 분석 | Gemini |
| bulk | CRUD, 보일러플레이트 | GLM |
| writing | 문서, README | GLM |
| quick | 단순 변환, 포맷팅 | GPT none |

---

## MCP 도구 목록

| 도구 | 설명 |
|------|------|
| `smart_route` | 카테고리 자동 분류 + 최적 모델 라우팅 + 폴백 |
| `ask_parallel` | 3모델 동시 호출 (Promise.allSettled) |
| `ask_gpt` | GPT Responses API (reasoning_effort 지원) |
| `ask_gemini` | Gemini OpenAI 호환 (max_tokens, temperature) |
| `ask_glm` | GLM Z.ai (max_tokens, temperature) |
| `get_usage_stats` | 모델별 토큰 사용량 통계 |

---

## OMO 대응표

| OMO 에이전트 | claude-omo 대응 |
|---|---|
| Sisyphus (오케스트레이터) | `sisyphus` 에이전트 + ULW 훅 |
| Oracle (아키텍처 컨설턴트) | `oracle` 에이전트 |
| Librarian (문서 검색) | `researcher` 에이전트 |
| Explore (빠른 검색) | `explore` 에이전트 |
| Hephaestus (구현) | `worker` 에이전트 |
| Momus (리뷰/검증) | `reviewer` 에이전트 |
| Prometheus (계획) | `/plan` 커맨드 |
| Intent Gate + Categories | `smart_route` MCP 도구 |
| ask_parallel | `ask_parallel` MCP 도구 |
