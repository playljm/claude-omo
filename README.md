# claude-omo

**OMO(oh-my-opencode) 스타일 멀티모델 오케스트레이션 — Claude Code 네이티브 구현**

GPT / Gemini / GLM 세 모델을 카테고리 기반으로 자동 라우팅하고,
OMO의 핵심 에이전트 패턴(Sisyphus, Oracle, Explore 등)을 Claude Code 프리미티브로 이식한 설정 모음.

---

## 구조

```
claude-omo/
├── mcp-server/          # Multi-Model MCP 서버 v4.0
│   ├── index.js         # smart_route, ask_parallel, fetchWithRetry 포함
│   ├── ulw-detector.js  # ULW 모드 훅 (UserPromptSubmit)
│   └── session-summary.js # 세션 종료 시 사용량 요약
├── agents/              # .claude/agents/ 에 복사
│   ├── sisyphus.md      # 멀티에이전트 오케스트레이터 (ULW)
│   ├── oracle.md        # GPT high, 아키텍처 컨설턴트 (읽기전용)
│   ├── researcher.md    # Gemini, 대규모 코드 분석 (읽기전용)
│   ├── worker.md        # GLM + 구현 도구
│   ├── reviewer.md      # ask_parallel 코드 리뷰 (읽기전용)
│   └── explore.md       # Haiku, 빠른 파일 검색 (읽기전용)
├── commands/            # .claude/commands/ 에 복사
│   ├── plan.md          # /plan — Prometheus 인터뷰 기반 계획
│   ├── route.md         # /route — smart_route 바로가기
│   └── compare.md       # /compare — ask_parallel 3모델 비교
└── CLAUDE.md            # ~/.claude/CLAUDE.md 라우팅 규칙
```

---

## 설치

### 1. MCP 서버

```bash
cp -r mcp-server/ ~/mcp-servers/multi-model/
cd ~/mcp-servers/multi-model && npm install
```

### 2. 에이전트 & 커맨드

```bash
cp agents/*.md /path/to/project/.claude/agents/
cp commands/*.md /path/to/project/.claude/commands/
```

### 3. CLAUDE.md

```bash
cp CLAUDE.md ~/.claude/CLAUDE.md
```

### 4. settings.json 훅 등록

`~/.claude/settings.json`의 `hooks` 섹션에 추가:

```json
"hooks": {
  "UserPromptSubmit": [{
    "hooks": [{
      "type": "command",
      "command": "node ~/mcp-servers/multi-model/ulw-detector.js 2>/dev/null || true"
    }]
  }],
  "SessionEnd": [{
    "hooks": [{
      "type": "command",
      "command": "node ~/mcp-servers/multi-model/session-summary.js 2>/dev/null || true"
    }]
  }]
}
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
| `oracle` | 아키텍처 컨설턴트 | GPT high |
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

---

## 필요 환경

- Claude Code CLI
- Node.js 18+
- `GEMINI_API_KEY` 환경변수 (AI Studio)
- `GLM_API_KEY` 환경변수 (Z.ai)
- `codex login` 완료 (GPT OAuth)
