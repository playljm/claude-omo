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
    # /c/Users/... → C:/Users/...  (Node.js는 Unix 슬래시도 인식)
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

# ─── 3. MCP 서버 설치 ──────────────────────────────────────
step "MCP 서버 설치: $MCP_DIR"
mkdir -p "$MCP_DIR"
cp -r "$REPO_DIR/mcp-server/." "$MCP_DIR/"
(cd "$MCP_DIR" && npm install --silent --no-audit)
info "MCP 서버 설치 완료 ($(node -e "console.log(require('$MCP_DIR/package.json').version)" 2>/dev/null || echo 'v4.0.0'))"

# ─── 4. 에이전트 복사 ──────────────────────────────────────
step "에이전트 복사: $CLAUDE_DIR/agents/"
mkdir -p "$CLAUDE_DIR/agents"
cp "$REPO_DIR/agents/"*.md "$CLAUDE_DIR/agents/"
AGENT_COUNT=$(ls "$CLAUDE_DIR/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
info "에이전트 ${AGENT_COUNT}개 복사 완료"

# ─── 5. 커맨드 복사 ────────────────────────────────────────
step "커맨드 복사: $CLAUDE_DIR/commands/"
mkdir -p "$CLAUDE_DIR/commands"
cp "$REPO_DIR/commands/"*.md "$CLAUDE_DIR/commands/"
CMD_COUNT=$(ls "$CLAUDE_DIR/commands/"*.md 2>/dev/null | wc -l | tr -d ' ')
info "커맨드 ${CMD_COUNT}개 복사 완료"

# ─── 6. CLAUDE.md 복사 ─────────────────────────────────────
step "CLAUDE.md 복사: $CLAUDE_DIR/CLAUDE.md"
if [[ -f "$CLAUDE_DIR/CLAUDE.md" ]]; then
  BACKUP="$CLAUDE_DIR/CLAUDE.md.bak.$(date +%Y%m%d_%H%M%S)"
  cp "$CLAUDE_DIR/CLAUDE.md" "$BACKUP"
  warn "기존 CLAUDE.md → $BACKUP 로 백업"
fi
cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
info "CLAUDE.md 복사 완료"

# ─── 7. settings.json 업데이트 ─────────────────────────────
step "settings.json 훅 + MCP 서버 등록"

SETTINGS="$CLAUDE_DIR/settings.json"
[[ ! -f "$SETTINGS" ]] && echo '{}' > "$SETTINGS"

# Node.js/Python용 절대경로 (Windows Git Bash에서도 작동)
MCP_NODE_PATH="$(normalize_path "$MCP_DIR")"
SETTINGS_WIN="$(normalize_path "$SETTINGS")"

python3 - <<PYEOF
import json, os, sys

settings_path = "$SETTINGS_WIN"
mcp_path = "$MCP_NODE_PATH"

try:
    with open(settings_path, 'r', encoding='utf-8') as f:
        s = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
    s = {}

# ── hooks ──────────────────────────────────────
hooks = s.setdefault("hooks", {})

def upsert_hook(hooks, event, cmd):
    """이미 등록된 경우 중복 삽입 방지. 빈 배열/비정상 구조도 복구."""
    entries = hooks.setdefault(event, [])
    # 빈 배열이거나 첫 요소가 dict가 아닌 경우 초기화
    if not entries or not isinstance(entries[0], dict):
        entries.clear()
        entries.append({"hooks": []})
    hook_list = entries[0].setdefault("hooks", [])
    existing = [h.get("command", "") for h in hook_list]
    script_name = os.path.basename(cmd.split()[1])
    if not any(script_name in c for c in existing):
        hook_list.append({"type": "command", "command": cmd})

ulw_cmd  = f"node {mcp_path}/ulw-detector.js 2>/dev/null || true"
sess_cmd = f"node {mcp_path}/session-summary.js 2>/dev/null || true"

upsert_hook(hooks, "UserPromptSubmit", ulw_cmd)
upsert_hook(hooks, "SessionEnd", sess_cmd)

# ── mcpServers ─────────────────────────────────
mcp_servers = s.setdefault("mcpServers", {})
mcp_servers["multi-model-agent"] = {
    "type": "stdio",
    "command": "node",
    "args": [f"{mcp_path}/index.js"]
}

with open(settings_path, 'w', encoding='utf-8') as f:
    json.dump(s, f, indent=2, ensure_ascii=False)

print(f"  훅 등록: UserPromptSubmit (ulw-detector), SessionEnd (session-summary)")
print(f"  MCP 등록: multi-model-agent → {mcp_path}/index.js")
PYEOF
info "settings.json 업데이트 완료"

# ─── 8. API 키 안내 ─────────────────────────────────────────
step "환경변수 설정 안내"

MISSING_KEYS=0
echo ""

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  warn "GEMINI_API_KEY 미설정  →  https://aistudio.google.com/apikey"
  MISSING_KEYS=$((MISSING_KEYS + 1))
else
  info "GEMINI_API_KEY ✓"
fi

if [[ -z "${GLM_API_KEY:-}" ]]; then
  warn "GLM_API_KEY 미설정    →  https://open.bigmodel.cn"
  MISSING_KEYS=$((MISSING_KEYS + 1))
else
  info "GLM_API_KEY ✓"
fi

if ! command -v codex &>/dev/null; then
  warn "codex CLI 미설치      →  npm install -g @openai/codex  &&  codex login"
else
  info "Codex CLI ✓"
fi

if [[ $MISSING_KEYS -gt 0 ]]; then
  echo ""
  SHELL_RC="$HOME/.bashrc"
  [[ -f "$HOME/.zshrc" ]] && SHELL_RC="$HOME/.zshrc"
  echo "  다음을 ${SHELL_RC} 에 추가한 뒤 source 하세요:"
  echo ""
  echo "    export GEMINI_API_KEY='your_key_here'"
  echo "    export GLM_API_KEY='your_key_here'"
  echo ""
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
