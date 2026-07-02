# claude-omo 트러블슈팅 가이드

Linux(Ubuntu / Rocky) 서버에서 반복적으로 발생하는 문제와 해결법.

---

## 빠른 진단 — 증상으로 찾기

| 에러 메시지 | 원인 | 해결법 |
|------------|------|--------|
| `GLM_API_KEY 환경변수 없음` | .bashrc가 MCP에 전달 안 됨 | [→ GLM 환경변수 주입](#1-glm-환경변수-없음) |
| `insufficient balance` | 위와 동일 (잔액이 아님) | [→ GLM 환경변수 주입](#1-glm-환경변수-없음) |
| `~/.codex/auth.json 파일이 없습니다` | API 키/codex CLI/OAuth opt-in 모두 없음 | [→ GPT 인증 설정](#2-gpt-인증-설정) |
| `access_token이 없습니다` | auth.json 구조 불완전 | [→ auth.json 구조 확인](#3-gpt-토큰-구조-불완전) |
| `토큰이 만료되었고 refresh_token이 없습니다` | 오래된 auth.json | [→ auth.json 재복사](#4-gpt-토큰-만료) |
| `api.responses.write 스코프가 없습니다` | ChatGPT OAuth 직접 호출 opt-in 상태에서 스코프 부족 | [→ GPT 인증 우선순위](#8-gpt-인증-우선순위와-oauth-제한) |
| `SessionEnd IndexError` | settings.json 빈 배열 | install.sh 재실행 |
| `settings.json 경로 오류` | Windows Git Bash 경로 | install.sh 재실행 |
| `도구를 찾을 수 없습니다` | claude mcp add 미실행 | [→ MCP 미등록](#5-설치-후-mcp가-등록-안-됨-가장-흔한-문제) |
| `claude mcp list`에 없음 | settings.json 직접편집 한계 | [→ MCP 미등록](#5-설치-후-mcp가-등록-안-됨-가장-흔한-문제) |

---

## 모델별 필요 설정 한눈에 보기

| 모델 | 모델명 | 인증 방식 | 필요한 것 |
|------|--------|-----------|-----------|
| **GPT** | `gpt-5.3-codex` | API 키 → codex CLI → ChatGPT OAuth opt-in | `OPENAI_API_KEY` 또는 `codex login` 권장 |
| **GLM** | `glm-5` | API Key | `GLM_API_KEY` in Claude MCP env |

> **핵심**: Linux에서 `.bashrc` export는 MCP 서버에 **전달되지 않음**.
> `install.sh`가 `claude mcp add -e`로 MCP env를 등록하며, 실패 시 settings.json 직접 편집으로 폴백함.

---

## 1. GLM — 환경변수 없음

### 증상
```
GLM_API_KEY 환경변수 없음.
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
# → GLM 응답하면 성공
```

---

## 2. GPT — 인증 설정

### 증상
```
~/.codex/auth.json 파일이 없습니다. 터미널에서 `codex login`을 실행하세요.
```

### 원인
`OPENAI_API_KEY`, `codex` CLI 인증, ChatGPT OAuth opt-in 경로가 모두 실패함.

### 해결법

**방법 1 — OPENAI_API_KEY 사용 (권장)**
```bash
export OPENAI_API_KEY=sk-...
cd ~/claude-omo && bash install.sh
```

**방법 2 — 서버에서 codex CLI 로그인**
```bash
codex login
```

**방법 3 — auth.json 복사 (마지막 수단)**
```bash
# 전용 사용자 계정으로만 복사. root 공유 금지.
ssh <user>@<서버IP> "mkdir -p ~/.codex && chmod 700 ~/.codex"
scp ~/.codex/auth.json <user>@<서버IP>:~/.codex/auth.json
ssh <user>@<서버IP> "chmod 600 ~/.codex/auth.json"
```

`auth.json`에는 refresh token이 들어갈 수 있음. 문서/로그/이슈/채팅에 원문을 붙여넣지 말 것.
ChatGPT OAuth 직접 호출은 `providers.json`에서 `allow_chatgpt_oauth: true`로 opt-in해야 하며 권장하지 않음.

**확인**
```bash
node ~/mcp-servers/multi-model/index.js --selftest
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
python3 - <<'PY'
import json, pathlib
p = pathlib.Path.home()/'.codex/auth.json'
d = json.loads(p.read_text())
t = d.get('tokens', d)
print('access_token:', 'OK' if t.get('access_token') else 'MISSING')
print('refresh_token:', 'OK' if t.get('refresh_token') else 'MISSING')
PY
```
토큰 값 자체는 출력하지 않음.

### 해결법
가능하면 `OPENAI_API_KEY` 또는 서버에서 `codex login`을 사용. 복사가 꼭 필요하면 전용 사용자 계정으로
권한을 제한해 재복사.

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
권장 순서:
```bash
# 1. 정식 API 키 사용
export OPENAI_API_KEY=sk-...

# 2. 또는 서버에서 공식 CLI 로그인
codex login
```

브라우저 없는 서버라서 복사가 불가피하면 전용 사용자 계정으로 복사하고 `chmod 600 ~/.codex/auth.json`을 적용.

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
" 2>/dev/null || echo "auth.json 없음 — OPENAI_API_KEY 또는 codex CLI 경로 사용"

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

## 8. GPT — 인증 우선순위와 OAuth 제한

### 현재 v6.0+ 동작

GPT 프로바이더는 `providers.json`의 `auth_priority` 순서대로 인증을 시도함.

| 우선순위 | 방식 | 상태 |
|----------|------|------|
| 1순위 | `OPENAI_API_KEY` | 권장. 정식 OpenAI 플랫폼 API |
| 2순위 | `codex` CLI | 권장. 공식 CLI를 서브프로세스로 실행 |
| 3순위 | ChatGPT OAuth `auth.json` | 기본 비활성화. `allow_chatgpt_oauth: true`일 때만 시도 |

`auth.json`의 ChatGPT OAuth 토큰을 MCP 서버가 직접 API 호출에 쓰는 방식은 ToS 리스크가 있어 기본적으로
꺼져 있음. 켠 경우에도 현재 코드는 `api.responses.write` 스코프가 없으면 실패시키고,
Codex backend 직접 호출로 자동 우회하지 않음.

### `api.responses.write 스코프가 없습니다`

이 에러가 나오면 우선 아래 중 하나로 전환:

```bash
# 권장 1: 정식 API 키 등록
export OPENAI_API_KEY=sk-...
cd ~/claude-omo && bash install.sh

# 권장 2: 서버에서 공식 codex CLI 로그인
codex login
```

ChatGPT OAuth를 계속 쓰려면 `providers.json`에서 명시적으로 opt-in:

```json
{
  "providers": {
    "gpt": {
      "auth": {
        "allow_chatgpt_oauth": true
      }
    }
  }
}
```

단, 이 경로는 권장하지 않음. 토큰 파일은 `chmod 600 ~/.codex/auth.json`으로 제한하고 원문을 출력하지 말 것.

---

## 재설치 체크리스트

서버를 새로 셋업할 때 순서:

- [ ] Node.js 18+ 설치
- [ ] `npm install -g @anthropic-ai/claude-code`
- [ ] `git clone https://github.com/playljm/claude-omo`
- [ ] `bash claude-omo/install.sh` (GLM_API_KEY, OPENAI_API_KEY 입력)
- [ ] `codex login` 서버 직접 실행 또는, 불가피한 경우 전용 사용자 계정으로 `~/.codex/auth.json` 복사 후 `chmod 600`
- [ ] Claude Code 재시작
- [ ] `/compare 안녕?` 으로 2모델 동작 확인
