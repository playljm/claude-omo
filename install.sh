#!/usr/bin/env bash
# ============================================================
# claude-omo installer
# GPT / GLM 멀티모델 오케스트레이션 원클릭 설치
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

# ────────────────────────────────────────────────────────────────
# Python 인터프리터 검색 (Windows Store stub 회피)
# ────────────────────────────────────────────────────────────────
find_python() {
  # timeout 명령 확인 (macOS 기본 설치엔 timeout이 없음 → gtimeout으로 폴백,
  # 둘 다 없으면 래핑 없이 직접 실행)
  local timeout_prefix=""
  if command -v timeout >/dev/null 2>&1; then
    timeout_prefix="timeout 2s"
  elif command -v gtimeout >/dev/null 2>&1; then
    timeout_prefix="gtimeout 2s"
  fi

  # python3 → python → py -3 순서로 검색
  for cmd in python3 python 'py -3'; do
    # 명령 존재 여부 확인
    if command -v ${cmd%% *} >/dev/null 2>&1; then
      # 실제 인터프리터인지 테스트 (Windows Store stub은 타임아웃)
      if $timeout_prefix $cmd -c "import sys" >/dev/null 2>&1; then
        PYTHON_CMD="$cmd"
        info "Python 인터프리터 발견: $PYTHON_CMD"
        return 0
      fi
    fi
  done

  error "작동하는 Python 3 인터프리터를 찾을 수 없습니다.\n       Python을 설치하고 PATH에 추가하세요."
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
  # 비인터랙티브 모드면 기존 값만 반환
  if [[ ! -t 0 ]]; then
    echo "${current:-}"
    return 0
  fi
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

GLM_KEY=$(collect_key "GLM_API_KEY" "https://open.bigmodel.cn")
echo "  ※ ChatGPT OAuth 직접 호출은 ToS 위반 소지로 기본 비활성화됐습니다. OPENAI_API_KEY(권장) 또는 codex CLI를 사용하세요."
OPENAI_KEY=$(collect_key "OPENAI_API_KEY" "https://platform.openai.com/api-keys")

# ────────────────────────────────────────────────────────────────
# Python 인터프리터 검색 실행
# ────────────────────────────────────────────────────────────────
step "Python 인터프리터 확인"
if ! find_python; then
  exit 1
fi

# 키가 없으면 기존 등록 파일에서 복원 시도 (재설치 시 키 유지)
# 우선순위: ~/.claude.json (claude mcp add --scope user 정식 등록 경로)
#          > ~/.claude/settings.json (직접 편집 폴백 경로)
_EXISTING_CLAUDE_JSON="$HOME/.claude.json"
_EXISTING_SETTINGS="$HOME/.claude/settings.json"

_get_env_key() {
  # $1: 파일 경로  $2: 환경변수 이름
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  $PYTHON_CMD -c "import json; s=json.load(open('$file')); print(s.get('mcpServers',{}).get('multi-model-agent',{}).get('env',{}).get('$key',''))" 2>/dev/null || echo ""
}

if [[ -z "$GLM_KEY" ]]; then
  GLM_KEY=$(_get_env_key "$_EXISTING_CLAUDE_JSON" "GLM_API_KEY")
  if [[ -n "$GLM_KEY" ]]; then
    warn "GLM_API_KEY: ~/.claude.json 기존 키 재사용" >&2
  else
    GLM_KEY=$(_get_env_key "$_EXISTING_SETTINGS" "GLM_API_KEY")
    [[ -n "$GLM_KEY" ]] && warn "GLM_API_KEY: settings.json 기존 키 재사용" >&2 || true
  fi
fi
if [[ -z "$OPENAI_KEY" ]]; then
  OPENAI_KEY=$(_get_env_key "$_EXISTING_CLAUDE_JSON" "OPENAI_API_KEY")
  if [[ -n "$OPENAI_KEY" ]]; then
    warn "OPENAI_API_KEY: ~/.claude.json 기존 키 재사용" >&2
  else
    OPENAI_KEY=$(_get_env_key "$_EXISTING_SETTINGS" "OPENAI_API_KEY")
    [[ -n "$OPENAI_KEY" ]] && warn "OPENAI_API_KEY: settings.json 기존 키 재사용" >&2 || true
  fi
fi

[[ -n "$GLM_KEY"     ]] && info "GLM_API_KEY 수집됨"     || warn "GLM_API_KEY 건너뜀 (나중에 수동 설정 필요)"
[[ -n "$OPENAI_KEY"  ]] && info "OPENAI_API_KEY 수집됨"  || warn "OPENAI_API_KEY 건너뜀 (GPT는 ~/.codex/auth.json 으로 폴백)"

# ─── 4. MCP 서버 설치 ──────────────────────────────────────
step "MCP 서버 설치: $MCP_DIR"
mkdir -p "$MCP_DIR"

# providers.json은 사용자가 직접 편집하는 설정 파일 — 재설치 시 기존 값 보존
_PROVIDERS_JSON="$MCP_DIR/providers.json"
_PROVIDERS_BACKUP="$MCP_DIR/.providers.json.omo-bak"
[[ -f "$_PROVIDERS_JSON" ]] && cp "$_PROVIDERS_JSON" "$_PROVIDERS_BACKUP"

cp -r "$REPO_DIR/mcp-server/." "$MCP_DIR/"

if [[ -f "$_PROVIDERS_BACKUP" ]]; then
  mv "$_PROVIDERS_BACKUP" "$_PROVIDERS_JSON"
  info "providers.json: 기존 사용자 설정 보존"
fi

(cd "$MCP_DIR" && npm install --silent --no-audit)
MCP_VERSION=$($PYTHON_CMD -c "import json; print(json.load(open('$MCP_DIR/package.json')).get('version','unknown'))" 2>/dev/null || echo "unknown")
info "MCP 서버 설치 완료 ($MCP_VERSION)"

# ─── 5. 에이전트 복사 ──────────────────────
step "에이전트 복사: $CLAUDE_DIR/agents/"
mkdir -p "$CLAUDE_DIR/agents"
cp "$REPO_DIR/agents/"*.md "$CLAUDE_DIR/agents/"
AGENT_COUNT=$(ls "$CLAUDE_DIR/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
info "에이전트 ${AGENT_COUNT}개 복사 완료 (sisyphus+, oracle, researcher, worker, reviewer, debugger, explore, hephaestus, prometheus, atlas, metis, momus, sisyphus-junior)"

# ─── 6. 커맨드 복사 ──────────────────────
step "커맨드 복사: $CLAUDE_DIR/commands/"
mkdir -p "$CLAUDE_DIR/commands"

# 로컬에서 직접 커스터마이징한 커맨드는 재설치 시 덮어쓰지 않음
PROTECTED_COMMANDS=("finish.md")

for _src in "$REPO_DIR/commands/"*.md; do
  _fname="$(basename "$_src")"
  _dst="$CLAUDE_DIR/commands/$_fname"
  _is_protected=false
  for _p in "${PROTECTED_COMMANDS[@]}"; do
    [[ "$_fname" == "$_p" ]] && _is_protected=true && break
  done
  if [[ "$_is_protected" == "true" && -f "$_dst" ]] && ! diff -q "$_src" "$_dst" >/dev/null 2>&1; then
    warn "$_fname: 로컬 커스텀 보호로 스킵"
    continue
  fi
  cp "$_src" "$_dst"
done

CMD_COUNT=$(ls "$CLAUDE_DIR/commands/"*.md 2>/dev/null | wc -l | tr -d ' ')
info "커맨드 ${CMD_COUNT}개 복사 완료 (plan, route, compare, ralph-loop, ulw-loop, handoff, init-deep, start-work, stop-continuation, cancel-ralph, refactor, finish, usage, hard)"

# ─── 6a. 스킬 복사 ─────────────────────
step "스킬 복사: $CLAUDE_DIR/skills/"
mkdir -p "$CLAUDE_DIR/skills"
if [[ -d "$REPO_DIR/skills" ]]; then
  cp -r "$REPO_DIR/skills/"* "$CLAUDE_DIR/skills/"
  SKILL_COUNT=$(ls -d "$CLAUDE_DIR/skills/"*/  2>/dev/null | wc -l | tr -d ' ')
  info "스킬 ${SKILL_COUNT}개 복사 완료 (git-master, frontend-ui-ux, playwright)"
fi

# ─── 7. CLAUDE.md 병합 ─────────────────────────────────────
# 레포 CLAUDE.md는 <!-- OMO:START --> ~ <!-- OMO:END --> 마커로 감싸져 배포된다.
# 기존 파일에 마커 쌍이 있으면 그 블록만 레포 버전으로 교체하고,
# 마커가 없는 기존 파일이면 사용자 내용을 보존한 채 파일 끝에 레포 버전을 append한다.
step "CLAUDE.md 병합: $CLAUDE_DIR/CLAUDE.md"
if [[ -f "$CLAUDE_DIR/CLAUDE.md" ]]; then
  BACKUP="$CLAUDE_DIR/CLAUDE.md.bak.$(date +%Y%m%d_%H%M%S)"
  cp "$CLAUDE_DIR/CLAUDE.md" "$BACKUP"

  $PYTHON_CMD - "$CLAUDE_DIR/CLAUDE.md" "$REPO_DIR/CLAUDE.md" <<'PYEOF'
import re, sys

user_path, repo_path = sys.argv[1], sys.argv[2]

with open(repo_path, 'r', encoding='utf-8') as f:
    repo_content = f.read()
with open(user_path, 'r', encoding='utf-8') as f:
    user_content = f.read()

START = "<!-- OMO:START -->"
END   = "<!-- OMO:END -->"
pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)

if pattern.search(user_content):
    merged = pattern.sub(lambda m: repo_content.strip(), user_content, count=1)
    mode = "마커 블록 교체"
else:
    sep = "" if user_content.endswith("\n") else "\n"
    merged = user_content + sep + "\n" + repo_content.rstrip("\n") + "\n"
    mode = "기존 내용 보존 + append"

with open(user_path, 'w', encoding='utf-8') as f:
    f.write(merged)

print(f"  CLAUDE.md 병합 완료 ({mode})")
PYEOF
  info "기존 CLAUDE.md → $BACKUP 로 백업 후 병합 완료"
else
  cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
  info "CLAUDE.md 복사 완료"
fi

# ─── 8. settings.json 훅 등록 ──────────────────────────────
step "settings.json 훅 등록"

SETTINGS="$CLAUDE_DIR/settings.json"
[[ ! -f "$SETTINGS" ]] && echo '{}' > "$SETTINGS"

MCP_NODE_PATH="$(normalize_path "$MCP_DIR")"
SETTINGS_WIN="$(normalize_path "$SETTINGS")"
# nvm 등 PATH 비표준 환경 대비: node 전체 경로 사용
NODE_BIN="$(command -v node)"
NODE_BIN_WIN="$(normalize_path "$NODE_BIN")"

$PYTHON_CMD - "$SETTINGS_WIN" "$MCP_NODE_PATH" "$NODE_BIN_WIN" <<'PYEOF'
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
comment_cmd    = f"{node_bin} {mcp_path}/hooks/comment-checker.js 2>/dev/null || true"
write_guard_cmd = f"{node_bin} {mcp_path}/hooks/write-guard.js 2>/dev/null || true"
pre_indicator_cmd = f"{node_bin} {mcp_path}/hooks/pre-call-indicator.js 2>/dev/null || true"
post_logger_cmd   = f"{node_bin} {mcp_path}/hooks/post-call-logger.js 2>/dev/null || true"
routing_display_cmd = f"{node_bin} {mcp_path}/hooks/routing-display.js 2>/dev/null || true"
agent_banner_cmd    = f"{node_bin} {mcp_path}/hooks/agent-banner.js 2>/dev/null || true"

upsert_hook(hooks, "UserPromptSubmit", ulw_cmd)
upsert_hook(hooks, "SessionEnd", sess_cmd)

def upsert_matcher_hook(hooks, event, matcher, cmd):
    """매처별 훅 항목 등록 (중복 방지)"""
    entries = hooks.setdefault(event, [])
    script_name = os.path.basename(cmd.split()[1] if len(cmd.split()) > 1 else cmd)
    entry = next((e for e in entries if e.get("matcher","") == matcher), None)
    if entry is None:
        entry = {"matcher": matcher, "hooks": []}
        entries.append(entry)
    hook_list = entry.setdefault("hooks", [])
    if not any(script_name in h.get("command","") for h in hook_list):
        hook_list.append({"type": "command", "command": cmd})

# Quality + Activity hooks
upsert_matcher_hook(hooks, "PostToolUse", "Write|Edit", comment_cmd)
upsert_matcher_hook(hooks, "PreToolUse",  "Write",      write_guard_cmd)
# v5.3: MCP 호출 진행 표시기 + 활동 로거
upsert_matcher_hook(hooks, "PreToolUse",  "mcp__multi-model-agent", pre_indicator_cmd)
upsert_matcher_hook(hooks, "PostToolUse", "mcp__multi-model-agent", post_logger_cmd)
# v6.0: 라우팅 정보 표시 + 에이전트 배너
upsert_matcher_hook(hooks, "PostToolUse", "mcp__multi-model-agent", routing_display_cmd)
upsert_matcher_hook(hooks, "PreToolUse",  "Task",                   agent_banner_cmd)

with open(settings_path, 'w', encoding='utf-8') as f:
    json.dump(s, f, indent=2, ensure_ascii=False)
print(f"  훅 등록: UserPromptSubmit, SessionEnd, PreToolUse(3), PostToolUse(2) — v6.0")
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
  # 주의: 이름(multi-model-agent)이 -e 플래그보다 먼저 와야 함
  # (claude mcp add의 <env...> 가변인자가 이름을 env값으로 잘못 파싱하는 버그 방지)
  _mcp_add_args=(claude mcp add --scope user multi-model-agent)
  [[ -n "$GLM_KEY"     ]] && _mcp_add_args+=(-e "GLM_API_KEY=$GLM_KEY")
  [[ -n "$OPENAI_KEY"  ]] && _mcp_add_args+=(-e "OPENAI_API_KEY=$OPENAI_KEY")
  _mcp_add_args+=(-- "$NODE_BIN_WIN" "$MCP_NODE_PATH/index.js")

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
  $PYTHON_CMD - "$SETTINGS_WIN" "$MCP_NODE_PATH" "$GLM_KEY" "$NODE_BIN_WIN" "$OPENAI_KEY" <<'PYEOF'
import json, sys

settings_path, mcp_path, glm_key, node_bin, openai_key = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]

try:
    with open(settings_path, 'r', encoding='utf-8') as f:
        s = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
    s = {}

mcp_servers = s.setdefault("mcpServers", {})

# 기존 env 보존 후 업데이트
existing_env = mcp_servers.get("multi-model-agent", {}).get("env", {})
mcp_env = {}
if glm_key:    mcp_env["GLM_API_KEY"]    = glm_key
if openai_key: mcp_env["OPENAI_API_KEY"] = openai_key
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

CODEX_AUTH="$HOME/.codex/auth.json"
# ─── 10. GPT — codex auth.json 안내 ────────────────────────
step "GPT (Codex) 인증 설정"
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
    echo "    # 마지막 수단입니다. root 공유 대신 전용 사용자 계정으로만 복사하세요:"
    echo "    ssh $(whoami)@<이-서버-IP> \"mkdir -p ~/.codex && chmod 700 ~/.codex\""
    echo "    scp ~/.codex/auth.json $(whoami)@<이-서버-IP>:~/.codex/auth.json"
    echo "    ssh $(whoami)@<이-서버-IP> \"chmod 600 ~/.codex/auth.json\""
    echo ""
    echo "    auth.json에는 refresh token이 포함될 수 있으므로 로그/채팅/문서에 붙여넣지 마세요."
  fi
  echo ""
  mkdir -p "$HOME/.codex"
  warn "install.sh는 더 이상 auth.json 원문 붙여넣기를 받지 않습니다. OPENAI_API_KEY 또는 codex login을 권장합니다."
fi

# ─── 완료 ──────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
info "claude-omo 설치 완료!"
echo ""
echo "  슬래시 커맨드 (${CMD_COUNT}개):"
for _cmd_file in "$CLAUDE_DIR/commands/"*.md; do
  _cmd_name="$(basename "$_cmd_file" .md)"
  _cmd_desc=$($PYTHON_CMD -c "
import re
with open('$_cmd_file', encoding='utf-8') as fh:
    text = fh.read()
m = re.search(r'^description:\s*(.+)\$', text, re.MULTILINE)
desc = m.group(1).strip().strip('\"') if m else ''
print(desc[:47] + '...' if len(desc) > 50 else desc)
" 2>/dev/null || echo "")
  printf "    /%-16s — %s\n" "$_cmd_name" "$_cmd_desc"
done
echo ""
echo "  에이전트 (13개):"
echo "    sisyphus(+IntentGate) · oracle · researcher · worker · reviewer"
echo "    debugger · explore · hephaestus · prometheus · atlas"
echo "    metis · momus · sisyphus-junior"
echo ""
echo "  스킬 (3개): git-master · frontend-ui-ux · playwright"
echo ""
echo "  ULW 모드: 메시지에 'ulw' 또는 'ultrawork' 포함"
echo "  → 시지프스 모드 (TodoWrite 강제 + 병렬 에이전트)"
echo ""
echo "  Claude Code를 재시작하면 MCP 서버가 활성화됩니다."
echo "════════════════════════════════════════════════"
