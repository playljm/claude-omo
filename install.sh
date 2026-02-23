#!/usr/bin/env bash
# ============================================================
# claude-omo installer
# GPT / Gemini / GLM 멀티모델 오케스트레이션 원클릭 설치
# ============================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
MCP_DIR="$HOME/mcp-servers/multi-model"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()  { echo -e "\n${CYAN}▶ $1${NC}"; }

# Windows 경로 정규화 (Git Bash / MSYS)
normalize_path() {
  local p="$1"
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    echo "$p" | sed 's|^/\([a-zA-Z]\)/|\1:/|'
  else
    echo "$p"
  fi
}

echo ""
echo "════════════════════════════════════════════════"
echo "   claude-omo  —  멀티모델 오케스트레이션 설치"
echo "════════════════════════════════════════════════"

# ─── 0. OS 감지 ────────────────────────────────────────────
step "환경 감지"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || -n "${WINDIR:-}" ]]; then
  OS="windows"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS="mac"
else
  OS="linux"
fi
info "OS: $OS ($OSTYPE)"

# ─── 1. Node.js 확인 ────────────────────────────────────────
step "Node.js 18+ 확인"
if ! command -v node &>/dev/null; then
  error "Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치 후 재실행하세요."
fi
NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VER" -lt 18 ]]; then
  error "Node.js 18+ 필요. 현재: $(node --version)"
fi
info "Node.js $(node --version)"

# ─── 2. Claude Code CLI 확인 ────────────────────────────────
step "Claude Code CLI 확인"
if ! command -v claude &>/dev/null; then
  warn "claude CLI를 찾을 수 없습니다. 설치: npm install -g @anthropic-ai/claude-code"
else
  info "Claude Code: $(claude --version 2>/dev/null || echo 'installed')"
fi

# ─── 3. API 키 수집 (MCP env 주입용) ────────────────────────
step "API 키 수집"
echo "  MCP 서버가 API 키를 읽으려면 settings.json에 직접 주입해야 합니다."
echo "  (Linux/Rocky에서 .bashrc 환경변수는 MCP 프로세스에 전달되지 않음)"
echo ""

# 현재 환경변수에 있으면 기본값으로 사용, 없으면 입력 요청
# 주의: 프롬프트는 반드시 >&2 (stderr)로 출력해야 함
#       stdout은 값만 출력해야 $() 캡처 시 오염되지 않음
collect_key() {
  local varname="$1"
  local current="${!varname:-}"
  local prompt_url="$2"

  if [[ -n "$current" ]]; then
    echo -n "  $varname [현재 환경변수 사용: ${current:0:6}...]: " >&2
    read -r input
    if [[ -z "$input" ]]; then
      echo "$current"
    else
      echo "$input"
    fi
  else
    echo "  $varname 없음 → $prompt_url" >&2
    echo -n "  입력 (엔터=건너뜀): " >&2
    read -r input
    echo "${input:-}"
  fi
}

GEMINI_KEY=$(collect_key "GEMINI_API_KEY" "https://aistudio.google.com/apikey")
GLM_KEY=$(collect_key "GLM_API_KEY" "https://open.bigmodel.cn")

# 키가 없으면 기존 settings.json에서 복원 시도 (재설치 시 키 유지)
_EXISTING_SETTINGS="$HOME/.claude/settings.json"
if [[ -z "$GEMINI_KEY" ]] && [[ -f "$_EXISTING_SETTINGS" ]]; then
  GEMINI_KEY=$(python3 -c "import json; s=json.load(open('$_EXISTING_SETTINGS')); print(s.get('mcpServers',{}).get('multi-model-agent',{}).get('env',{}).get('GEMINI_API_KEY',''))" 2>/dev/null || echo "")
  [[ -n "$GEMINI_KEY" ]] && warn "GEMINI_API_KEY: settings.json 기존 키 재사용" >&2
fi
if [[ -z "$GLM_KEY" ]] && [[ -f "$_EXISTING_SETTINGS" ]]; then
  GLM_KEY=$(python3 -c "import json; s=json.load(open('$_EXISTING_SETTINGS')); print(s.get('mcpServers',{}).get('multi-model-agent',{}).get('env',{}).get('GLM_API_KEY',''))" 2>/dev/null || echo "")
  [[ -n "$GLM_KEY" ]] && warn "GLM_API_KEY: settings.json 기존 키 재사용" >&2
fi

[[ -n "$GEMINI_KEY" ]] && info "GEMINI_API_KEY 수집됨" || warn "GEMINI_API_KEY 건너뜀 (나중에 수동 설정 필요)"
[[ -n "$GLM_KEY"    ]] && info "GLM_API_KEY 수집됨"    || warn "GLM_API_KEY 건너뜀 (나중에 수동 설정 필요)"

# ─── 4. MCP 서버 설치 ──────────────────────────────────────
step "MCP 서버 설치: $MCP_DIR"
mkdir -p "$MCP_DIR"
cp -r "$REPO_DIR/mcp-server/." "$MCP_DIR/"
(cd "$MCP_DIR" && npm install --silent --no-audit)
info "MCP 서버 설치 완료 ($(node -e "console.log(require('$MCP_DIR/package.json').version)" 2>/dev/null || echo 'v4.0.0'))"

# ─── 5. 에이전트 복사 ──────────────────────────────────────
step "에이전트 복사: $CLAUDE_DIR/agents/"
mkdir -p "$CLAUDE_DIR/agents"
cp "$REPO_DIR/agents/"*.md "$CLAUDE_DIR/agents/"
AGENT_COUNT=$(ls "$CLAUDE_DIR/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
info "에이전트 ${AGENT_COUNT}개 복사 완료"

# ─── 6. 커맨드 복사 ────────────────────────────────────────
step "커맨드 복사: $CLAUDE_DIR/commands/"
mkdir -p "$CLAUDE_DIR/commands"
cp "$REPO_DIR/commands/"*.md "$CLAUDE_DIR/commands/"
CMD_COUNT=$(ls "$CLAUDE_DIR/commands/"*.md 2>/dev/null | wc -l | tr -d ' ')
info "커맨드 ${CMD_COUNT}개 복사 완료"

# ─── 7. CLAUDE.md 복사 ─────────────────────────────────────
step "CLAUDE.md 복사: $CLAUDE_DIR/CLAUDE.md"
if [[ -f "$CLAUDE_DIR/CLAUDE.md" ]]; then
  BACKUP="$CLAUDE_DIR/CLAUDE.md.bak.$(date +%Y%m%d_%H%M%S)"
  cp "$CLAUDE_DIR/CLAUDE.md" "$BACKUP"
  warn "기존 CLAUDE.md → $BACKUP 로 백업"
fi
cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
info "CLAUDE.md 복사 완료"

# ─── 8. settings.json 훅 등록 ──────────────────────────────
step "settings.json 훅 등록"

SETTINGS="$CLAUDE_DIR/settings.json"
[[ ! -f "$SETTINGS" ]] && echo '{}' > "$SETTINGS"

MCP_NODE_PATH="$(normalize_path "$MCP_DIR")"
SETTINGS_WIN="$(normalize_path "$SETTINGS")"
# nvm 등 PATH 비표준 환경 대비: node 전체 경로 사용
NODE_BIN="$(command -v node)"
NODE_BIN_WIN="$(normalize_path "$NODE_BIN")"

python3 - "$SETTINGS_WIN" "$MCP_NODE_PATH" "$NODE_BIN_WIN" <<'PYEOF'
import json, os, sys

settings_path, mcp_path, node_bin = sys.argv[1], sys.argv[2], sys.argv[3]

try:
    with open(settings_path, 'r', encoding='utf-8') as f:
        s = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
    s = {}

# ── hooks ──────────────────────────────────────
hooks = s.setdefault("hooks", {})

def upsert_hook(hooks, event, cmd):
    """빈 배열/비정상 구조도 복구, 중복 삽입 방지"""
    entries = hooks.setdefault(event, [])
    if not entries or not isinstance(entries[0], dict):
        entries.clear()
        entries.append({"hooks": []})
    hook_list = entries[0].setdefault("hooks", [])
    existing = [h.get("command", "") for h in hook_list]
    script_name = os.path.basename(cmd.split()[1])
    if not any(script_name in c for c in existing):
        hook_list.append({"type": "command", "command": cmd})

# node 전체 경로 사용 (nvm 환경에서 훅 실행 시 PATH 미계승 대비)
ulw_cmd  = f"{node_bin} {mcp_path}/ulw-detector.js 2>/dev/null || true"
sess_cmd = f"{node_bin} {mcp_path}/session-summary.js 2>/dev/null || true"

upsert_hook(hooks, "UserPromptSubmit", ulw_cmd)
upsert_hook(hooks, "SessionEnd", sess_cmd)

with open(settings_path, 'w', encoding='utf-8') as f:
    json.dump(s, f, indent=2, ensure_ascii=False)

print(f"  훅 등록: UserPromptSubmit (ulw-detector), SessionEnd (session-summary)")
PYEOF
info "settings.json 훅 등록 완료"

# ─── 9. MCP 서버 등록 ──────────────────────────────────────
# 핵심: settings.json 직접 편집으로는 Claude Code가 MCP를 인식 못하는 경우가 있음
# → claude mcp add --scope user CLI를 통해 공식 등록해야 claude mcp list 에 표시되고
#   세션에서 mcp__multi-model-agent__* 도구가 활성화됨
step "MCP 서버 등록 (claude mcp add --scope user)"

MCP_REGISTERED=false

if command -v claude &>/dev/null; then
  # 기존 등록 제거 (오류 무시 — 없는 경우 포함)
  claude mcp remove multi-model-agent 2>/dev/null || true

  # ENV 플래그 배열 구성 (bash 배열로 특수문자 안전 처리)
  _mcp_add_args=(claude mcp add --scope user)
  [[ -n "$GEMINI_KEY" ]] && _mcp_add_args+=(-e "GEMINI_API_KEY=$GEMINI_KEY")
  [[ -n "$GLM_KEY"    ]] && _mcp_add_args+=(-e "GLM_API_KEY=$GLM_KEY")
  _mcp_add_args+=(multi-model-agent -- "$NODE_BIN_WIN" "$MCP_NODE_PATH/index.js")

  if "${_mcp_add_args[@]}" 2>/dev/null; then
    info "MCP 등록 완료 (claude mcp add --scope user)"
    MCP_REGISTERED=true
    # 등록 확인
    if claude mcp get multi-model-agent &>/dev/null; then
      info "MCP 확인: multi-model-agent ✓"
    else
      warn "claude mcp get 확인 실패 — Claude Code 재시작 후 동작 확인 필요"
    fi
  else
    warn "claude mcp add 실패 → settings.json 직접 편집으로 폴백"
  fi
fi

if [[ "$MCP_REGISTERED" == "false" ]]; then
  warn "settings.json 직접 편집으로 MCP 등록 (claude CLI 미사용 또는 실패 시 폴백)"
  python3 - "$SETTINGS_WIN" "$MCP_NODE_PATH" "$GEMINI_KEY" "$GLM_KEY" "$NODE_BIN_WIN" <<'PYEOF'
import json, sys

settings_path, mcp_path, gemini_key, glm_key, node_bin = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]

try:
    with open(settings_path, 'r', encoding='utf-8') as f:
        s = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
    s = {}

mcp_servers = s.setdefault("mcpServers", {})

# 기존 env 보존 후 업데이트
existing_env = mcp_servers.get("multi-model-agent", {}).get("env", {})
mcp_env = {}
if gemini_key: mcp_env["GEMINI_API_KEY"] = gemini_key
if glm_key:    mcp_env["GLM_API_KEY"]    = glm_key
for k, v in existing_env.items():
    if k not in mcp_env:
        mcp_env[k] = v

mcp_entry = {
    "type": "stdio",
    "command": node_bin,
    "args": [f"{mcp_path}/index.js"]
}
if mcp_env:
    mcp_entry["env"] = mcp_env

mcp_servers["multi-model-agent"] = mcp_entry

with open(settings_path, 'w', encoding='utf-8') as f:
    json.dump(s, f, indent=2, ensure_ascii=False)

print(f"  MCP 등록: multi-model-agent → {mcp_path}/index.js")
keys_str = ", ".join(mcp_env.keys()) if mcp_env else "없음"
print(f"  env 주입: {keys_str}")
PYEOF
  info "settings.json MCP 등록 완료"
fi

# ─── 10. GPT — codex auth.json 안내 ────────────────────────
step "GPT (Codex) 인증 설정"

CODEX_AUTH="$HOME/.codex/auth.json"
if [[ -f "$CODEX_AUTH" ]]; then
  info "~/.codex/auth.json 이미 존재 — GPT 바로 사용 가능"
else
  warn "~/.codex/auth.json 없음"
  echo ""
  echo "  [방법 1] codex login 실행 (브라우저 OAuth)"
  echo "    npm install -g @openai/codex && codex login"
  echo ""
  echo "  [방법 2] 다른 머신에서 auth.json 복사 (브라우저 없는 서버용)"
  if [[ "$OS" == "linux" ]]; then
    echo "    # Windows/Mac 머신에서 실행:"
    echo "    scp ~/.codex/auth.json $(whoami)@<이-서버-IP>:~/.codex/auth.json"
    echo ""
    echo "    # 또는 이 서버에서 직접:"
    echo "    mkdir -p ~/.codex"
    echo "    cat > ~/.codex/auth.json << 'EOF'"
    echo "    { \"auth_mode\": \"chatgpt\", \"tokens\": { \"access_token\": \"...\", \"refresh_token\": \"...\" } }"
    echo "    EOF"
  fi
  echo ""
  mkdir -p "$HOME/.codex"
  echo -n "  auth.json 내용을 지금 붙여넣을까요? [y/N]: "
  read -r paste_auth
  if [[ "${paste_auth,,}" == "y" ]]; then
    echo "  auth.json 내용을 붙여넣고 Ctrl+D로 완료:"
    cat > "$CODEX_AUTH"
    info "~/.codex/auth.json 저장 완료"
  else
    warn "GPT는 나중에 auth.json 복사 후 사용 가능"
  fi
fi

# ─── 완료 ──────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
info "claude-omo 설치 완료!"
echo ""
echo "  슬래시 커맨드:"
echo "    /compare <질문>  — GPT·Gemini·GLM 3모델 동시 비교"
echo "    /plan   <기능>   — Prometheus 인터뷰 기반 계획"
echo "    /route  <작업>   — smart_route 자동 라우팅"
echo ""
echo "  ULW 모드: 메시지에 'ulw' 또는 'ultrawork' 포함"
echo "  → 시지프스 모드 (TodoWrite 강제 + 병렬 에이전트)"
echo ""
echo "  Claude Code를 재시작하면 MCP 서버가 활성화됩니다."
echo "════════════════════════════════════════════════"
