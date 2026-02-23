# claude-omo 트러블슈팅 가이드

Linux(Ubuntu / Rocky) 서버에서 반복적으로 발생하는 문제와 해결법.

---

## 빠른 진단 — 증상으로 찾기

| 에러 메시지 | 원인 | 해결법 |
|------------|------|--------|
| `GLM_API_KEY 환경변수 없음` | .bashrc가 MCP에 전달 안 됨 | [→ GLM 환경변수 주입](#1-glm--gemini-환경변수-없음) |
| `GEMINI_API_KEY 환경변수 없음` | 동일 | [→ GLM 환경변수 주입](#1-glm--gemini-환경변수-없음) |
| `insufficient balance` | 위와 동일 (잔액이 아님) | [→ GLM 환경변수 주입](#1-glm--gemini-환경변수-없음) |
| `~/.codex/auth.json 파일이 없습니다` | codex login 미실행 | [→ GPT auth.json 복사](#2-gpt-authon-없음) |
| `access_token이 없습니다` | auth.json 구조 불완전 | [→ auth.json 구조 확인](#3-gpt-토큰-구조-불완전) |
| `토큰이 만료되었고 refresh_token이 없습니다` | 오래된 auth.json | [→ auth.json 재복사](#4-gpt-토큰-만료) |
| `api.responses.write 스코프가 없습니다` | ChatGPT OAuth 한계 (이미 자동 해결됨) | [→ Codex 백엔드 자동 사용](#8-gpt--chatgpt-oauth-codex-백엔드-자동-처리) |
| `SessionEnd IndexError` | settings.json 빈 배열 | install.sh 재실행 |
| `settings.json 경로 오류` | Windows Git Bash 경로 | install.sh 재실행 |
| `도구를 찾을 수 없습니다` | claude mcp add 미실행 | [→ MCP 미등록](#5-설치-후-mcp가-등록-안-됨-가장-흔한-문제) |
| `claude mcp list`에 없음 | settings.json 직접편집 한계 | [→ MCP 미등록](#5-설치-후-mcp가-등록-안-됨-가장-흔한-문제) |

---

## 모델별 필요 설정 한눈에 보기

| 모델 | 모델명 | 인증 방식 | 필요한 것 |
|------|--------|-----------|-----------|
| **GPT** | `gpt-5.3-codex` | OAuth JWT | `~/.codex/auth.json` |
| **Gemini** | `gemini-2.5-pro` | API Key | `GEMINI_API_KEY` in settings.json env |
| **GLM** | `glm-5` | API Key | `GLM_API_KEY` in settings.json env |

> **핵심**: Linux에서 `.bashrc` export는 MCP 서버에 **전달되지 않음**.
> API 키는 반드시 `~/.claude/settings.json`의 `mcpServers.multi-model-agent.env`에 있어야 함.

---

## 1. GLM / Gemini — 환경변수 없음

### 증상
```
GLM_API_KEY 환경변수 없음.
GEMINI_API_KEY 환경변수 없음.
insufficient balance   ← Z.ai가 키 없을 때 이 메시지를 반환하기도 함
```

### 원인
Claude Code가 MCP 서버를 subprocess로 실행할 때 `.bashrc`를 로드하지 않음.

### 해결법

**방법 1 — install.sh 재실행 (권장)**
```bash
cd ~/claude-omo && git pull && bash install.sh
# API 키 입력 프롬프트에서 실제 키 입력
```

**방법 2 — 수동으로 settings.json 편집**
```bash
cat ~/.claude/settings.json
```
`mcpServers.multi-model-agent`에 `env` 추가:
```json
{
  "mcpServers": {
    "multi-model-agent": {
      "type": "stdio",
      "command": "node",
      "args": ["/root/mcp-servers/multi-model/index.js"],
      "env": {
        "GEMINI_API_KEY": "실제키값",
        "GLM_API_KEY": "실제키값"
      }
    }
  }
}
```

**확인**
```bash
# Claude Code 재시작 후 테스트
# Claude Code 세션에서:
# /compare 안녕?
# → GLM, Gemini 모두 응답하면 성공
```

---

## 2. GPT — auth.json 없음

### 증상
```
~/.codex/auth.json 파일이 없습니다. 터미널에서 `codex login`을 실행하세요.
```

### 원인
서버 환경에서 브라우저 OAuth 불가.

### 해결법

**방법 1 — 다른 머신에서 복사 (권장)**
```bash
# Windows/Mac에서 codex login 완료 후 이 서버로 복사
scp ~/.codex/auth.json root@<서버IP>:~/.codex/auth.json

# 서버에서 수신 디렉토리 먼저 생성
ssh root@<서버IP> "mkdir -p ~/.codex"
```

**방법 2 — install.sh 실행 중 붙여넣기**
```bash
bash install.sh
# "auth.json 내용을 지금 붙여넣을까요? [y/N]:" 에서 y 입력
# Windows ~/.codex/auth.json 내용 붙여넣기 → Ctrl+D
```

**방법 3 — 직접 생성**
```bash
mkdir -p ~/.codex
cat > ~/.codex/auth.json << 'EOF'
{
  "auth_mode": "chatgpt",
  "tokens": {
    "access_token": "여기에_access_token",
    "refresh_token": "여기에_refresh_token",
    "id_token": "여기에_id_token",
    "account_id": "여기에_account_id"
  },
  "last_refresh": "2026-01-01T00:00:00.000Z"
}
EOF
```

**확인**
```bash
cat ~/.codex/auth.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK' if d.get('tokens',{}).get('access_token') else 'FAIL')"
```

---

## 3. GPT — 토큰 구조 불완전

### 증상
```
access_token이 없습니다. `codex login`으로 재인증이 필요합니다.
```

### 원인
auth.json이 있지만 `tokens.access_token` 필드가 없음.

### 확인
```bash
cat ~/.codex/auth.json
```
다음 구조인지 확인:
```json
{
  "tokens": {
    "access_token": "eyJhbG...",   ← 이게 있어야 함
    "refresh_token": "rt_..."       ← 이게 있어야 자동 갱신
  }
}
```

### 해결법
Windows에서 `~/.codex/auth.json` 재복사.

---

## 4. GPT — 토큰 만료

### 증상
```
토큰이 만료되었고 refresh_token이 없습니다. `codex login`으로 재인증하세요.
액세스 토큰 갱신 실패
```

### 원인
- `refresh_token` 없이 `access_token`만 있는 auth.json
- 또는 refresh_token도 만료됨 (장기 미사용)

### 해결법
Windows에서 `codex login` 후 auth.json 재복사:
```bash
# Windows에서
codex login   # 브라우저에서 재인증

# 서버로 재복사
scp ~/.codex/auth.json root@<서버IP>:~/.codex/auth.json
```

---

## 5. 설치 후 MCP가 등록 안 됨 (가장 흔한 문제)

### 증상
```
/compare 안녕?
● mcp__multi-model-agent__ask_parallel 도구를 찾을 수 없습니다.
```
또는 `claude mcp list`에서 `multi-model-agent`가 보이지 않음.

### 원인
`claude mcp add --scope user`는 `~/.claude/settings.json`이 아닌 **`~/.claude.json`** 파일에 MCP를 등록함.
`settings.json`의 `mcpServers` 직접 편집만으로는 Claude Code가 MCP를 인식하지 못함.
반드시 `claude mcp add --scope user` CLI 명령으로 등록해야 `claude mcp list`에 표시되고 세션에서 도구가 활성화됨.

### 확인
```bash
claude mcp list
# multi-model-agent 가 목록에 있어야 함

claude mcp get multi-model-agent
# "No MCP server found" → 미등록 상태
```

### 해결법 (권장)
```bash
cd ~/claude-omo && git pull && bash install.sh
# Claude Code 완전 종료 후 재시작
claude mcp list   # multi-model-agent 확인
```

### 해결법 (수동)
```bash
NODE_BIN=$(command -v node)
MCP_DIR=~/mcp-servers/multi-model

# 기존 등록 제거
claude mcp remove multi-model-agent 2>/dev/null || true

# 재등록 (API 키는 실제 값으로 교체)
claude mcp add --scope user \
  -e "GEMINI_API_KEY=실제키" \
  -e "GLM_API_KEY=실제키" \
  multi-model-agent -- "$NODE_BIN" "$MCP_DIR/index.js"

# 확인
claude mcp get multi-model-agent
```

---

## 6. Node.js 버전 문제 (Rocky Linux)

### 증상
```
Node.js 18+ 필요. 현재: v16.x
```

### 해결법
```bash
# Rocky Linux 8/9 — NodeSource 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
dnf install -y nodejs

# Ubuntu
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
```

---

## 7. python3 없음 (Rocky Linux 최소 설치)

### 증상
```
python3: command not found
```

### 해결법
```bash
# Rocky Linux
dnf install -y python3

# Ubuntu
apt-get install -y python3
```

---

## 전체 상태 한 번에 진단하는 스크립트

```bash
echo "=== claude-omo 상태 진단 ==="

echo ""
echo "[Node.js]"
node --version 2>/dev/null || echo "❌ 없음"

echo ""
echo "[Claude Code]"
claude --version 2>/dev/null || echo "❌ 없음"

echo ""
echo "[MCP 서버]"
ls ~/mcp-servers/multi-model/index.js 2>/dev/null && echo "✅ 설치됨" || echo "❌ 없음"

echo ""
echo "[settings.json env]"
python3 -c "
import json
s = json.load(open('$HOME/.claude/settings.json'))
env = s.get('mcpServers', {}).get('multi-model-agent', {}).get('env', {})
print('GEMINI_API_KEY:', '✅' if env.get('GEMINI_API_KEY') else '❌ 없음')
print('GLM_API_KEY:', '✅' if env.get('GLM_API_KEY') else '❌ 없음')
" 2>/dev/null || echo "❌ settings.json 파싱 실패"

echo ""
echo "[GPT auth.json]"
python3 -c "
import json
d = json.load(open('$HOME/.codex/auth.json'))
t = d.get('tokens', d)
print('access_token:', '✅' if t.get('access_token') else '❌ 없음')
print('refresh_token:', '✅' if t.get('refresh_token') else '❌ 없음 (만료 시 재로그인 필요)')
" 2>/dev/null || echo "❌ auth.json 없음 → GPT 사용 불가"

echo ""
echo "[Hooks]"
python3 -c "
import json
s = json.load(open('$HOME/.claude/settings.json'))
hooks = s.get('hooks', {})
ulw = any('ulw-detector' in str(h) for h in str(hooks))
sess = any('session-summary' in str(h) for h in str(hooks))
print('ULW hook:', '✅' if ulw else '❌')
print('SessionEnd hook:', '✅' if sess else '❌')
" 2>/dev/null || echo "❌ hooks 확인 실패"
```

---

## 8. GPT — ChatGPT OAuth Codex 백엔드 자동 처리

### v4.1 이후: 스코프 없어도 자동으로 동작합니다

**이전 버전**에서는 `api.responses.write` 스코프 없음 → Chat Completions 폴백 → HTTP 429 크레딧 부족 실패 체인이 발생했음.

**v4.1 수정 후**: `isOAuthOnly = true` 감지 시 `chatgpt.com/backend-api/codex/responses` 엔드포인트를 직접 사용.
ChatGPT Pro 구독 OAuth 토큰으로 GPT-5.3-Codex를 정상 호출합니다.

### 작동 원리

```
JWT 스코프 확인 → api.responses.write 없음 → isOAuthOnly = true
   ↓
JWT에서 https://api.openai.com/auth 클레임 추출 → chatgpt_account_id 획득
   ↓
POST https://chatgpt.com/backend-api/codex/responses
Headers:
  Authorization: Bearer <access_token>
  chatgpt-account-id: <chatgpt_account_id>
  OpenAI-Beta: responses=experimental
  originator: codex_cli_rs
Body: { model, instructions, store: false, stream: true, input: [...] }
   ↓
SSE 파싱 → response.completed 이벤트 → output_text 추출
```

### 여전히 실패하는 경우

**증상:**
```
ChatGPT account_id를 JWT에서 추출할 수 없습니다.
```

**해결법:** `codex login` 재실행 (Windows에서)
```bash
# Windows에서
codex login   # 브라우저 재인증

# 서버로 재복사
scp ~/.codex/auth.json root@<서버IP>:~/.codex/auth.json
```

**증상:**
```
GPT Codex backend 오류 (HTTP 403 또는 HTTP 401)
```

**해결법:** ChatGPT Plus/Pro 구독 상태 확인. 구독이 활성 상태여야 Codex 백엔드 접근 가능.

### OPENAI_API_KEY가 있으면 우선 사용됩니다

| 우선순위 | 방식 | 엔드포인트 |
|----------|------|-----------|
| 1순위 | OPENAI_API_KEY 환경변수 | api.openai.com/v1/responses |
| 2순위 | auth.json의 OPENAI_API_KEY | api.openai.com/v1/responses |
| 3순위 | ChatGPT OAuth (자동) | chatgpt.com/backend-api/codex/responses |
```bash
# OPENAI_API_KEY를 명시적으로 설정하고 싶을 때:
bash ~/claude-omo/install.sh   # OPENAI_API_KEY 프롬프트에서 입력
```

---

## 재설치 체크리스트

서버를 새로 셋업할 때 순서:

- [ ] Node.js 18+ 설치
- [ ] `npm install -g @anthropic-ai/claude-code`
- [ ] `git clone https://github.com/playljm/claude-omo`
- [ ] `bash claude-omo/install.sh` (GEMINI_API_KEY, GLM_API_KEY, OPENAI_API_KEY 입력)
- [ ] `~/.codex/auth.json` 다른 머신에서 복사 (OPENAI_API_KEY 없을 때)
- [ ] Claude Code 재시작
- [ ] `/compare 안녕?` 으로 3모델 동작 확인
