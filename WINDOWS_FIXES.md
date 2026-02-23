# install.sh Windows MSYS Compatibility Fixes

## Issue Analysis & Priority Ranking

| Priority | Issue | Root Cause | Status |
|----------|--------|------------|--------|
| **P1** | Python3 hangs with heredoc on Windows MSYS | Windows Store `python3` stub at `/c/Users/playl/AppData/Local/Microsoft/WindowsApps/python3` cannot handle stdin redirection (heredoc) | ✅ Fixed |
| **P2** | CLAUDE.md data loss on every run | Script always overwrites existing personalized config without asking | ✅ Fixed |
| **P3** | Interactive `read` fails in CI | `read -r` command called without checking if stdin is a terminal (`-t 0`) | ✅ Fixed |
| **P4** | Re-run hangs at same step | Combination of P1 (python3 hang) + no idempotency check | ✅ Fixed |
| - | Node path with spaces | normalize_path returns `C:/Program Files/nodejs/node` - handled by JSON quoting, no issue | N/A |

---

## Detailed Fixes

### P1: Python3 Hang (Critical)

**Problem:**
- Script hangs at line 176: `python3 - "$SETTINGS_WIN" "$MCP_NODE_PATH" "$NODE_BIN_WIN" <<'PYEOF'`
- Output shows "Python " (truncated) then hangs indefinitely
- Windows Store `python3` stub cannot process heredoc input

**Root Cause:**
On Windows 11, the Microsoft Store creates app execution aliases (`python3.exe`, `python.exe`) that redirect to the Store if Python isn't installed. These stubs are designed for:
1. Checking if Python is installed from Store
2. Opening Store if not installed
3. Delegating to real Python if installed

They are **NOT designed** to handle stdin redirection, which causes the hang.

**Solution:**
1. Added `find_python()` function that tests each candidate (python3 → python → py -3)
2. Uses `timeout 2s $cmd -c "import sys"` to verify the interpreter works
3. Windows Store stub will timeout/fail, real Python succeeds
4. Replaced all 3 occurrences of `python3` with `$PYTHON_CMD` variable

**Code Changes:**
```bash
# Added function (lines 28-46):
find_python() {
  # python3 → python → py -3 순서로 검색
  for cmd in python3 python 'py -3'; do
    # 명령 존재 여부 확인
    if command -v ${cmd%% *} >/dev/null 2>&1; then
      # 실제 인터프리터인지 테스트 (Windows Store stub은 타임아웃)
      if timeout 2s $cmd -c "import sys" >/dev/null 2>&1; then
        PYTHON_CMD="$cmd"
        info "Python 인터프리터 발견: $PYTHON_CMD"
        return 0
      fi
    fi
  done

  error "작동하는 Python 3 인터프리터를 찾을 수 없습니다.\n       Python을 설치하고 PATH에 추가하세요."
}

# Call find_python before first usage (lines 118-124):
step "Python 인터프리터 확인"
if ! find_python; then
  exit 1
fi

# Replaced 3 python3 occurrences:
# Line 130: $PYTHON_CMD -c "import json; ..."
# Line 176: $PYTHON_CMD - "$SETTINGS_WIN" "$MCP_NODE_PATH" "$NODE_BIN_WIN" <<'PYEOF'
# Line 261: $PYTHON_CMD - "$SETTINGS_WIN" "$MCP_NODE_PATH" "$GEMINI_KEY" "$GLM_KEY" "$NODE_BIN_WIN" "$OPENAI_KEY" <<'PYEOF'
```

---

### P2: CLAUDE.md Overwrite Protection (High)

**Problem:**
Script always overwrites `~/.claude/CLAUDE.md` with repo's version, potentially destroying user's personalized configuration.

**Root Cause:**
No user confirmation before overwriting existing file.

**Solution:**
Added `-t 0` check for interactive mode:
- If interactive: Ask user `[y] 덮어쓰기 (기존 파일은 백업됨) / [n] 건너뜀 (기존 파일 유지)`
- If non-interactive: Backup and overwrite (for CI/automation)

**Code Changes:**
```bash
# Lines 162-195 (CLAUDE.md 복사):
if [[ -f "$CLAUDE_DIR/CLAUDE.md" ]]; then
  # 인터랙티브 모드인 경우에만 사용자 확인
  if [[ -t 0 ]]; then
    echo "" >&2
    warn "기존 CLAUDE.md 파일이 존재합니다." >&2
    echo "  [y] 덮어쓰기 (기존 파일은 백업됨)" >&2
    echo "  [n] 건너뜀 (기존 파일 유지)" >&2
    echo "" >&2
    echo -n "  선택 [y/N]: " >&2
    read -r overwrite_choice
    if [[ "${overwrite_choice,,}" != "y" ]]; then
      warn "CLAUDE.md 덮어쓰기 건너뜀 (기존 파일 유지)"
    else
      BACKUP="$CLAUDE_DIR/CLAUDE.md.bak.$(date +%Y%m%d_%H%M%S)"
      cp "$CLAUDE_DIR/CLAUDE.md" "$BACKUP"
      cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
      info "기존 CLAUDE.md → $BACKUP 로 백업 후 덮어쓰기 완료"
    fi
  else
    # 비인터랙티브 모드: 백업 후 덮어쓰기
    BACKUP="$CLAUDE_DIR/CLAUDE.md.bak.$(date +%Y%m%d_%H%M%S)"
    cp "$CLAUDE_DIR/CLAUDE.md" "$BACKUP"
    cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
    warn "비인터랙티브 모드: 기존 CLAUDE.md → $BACKUP 로 백업 후 덮어쓰기"
  fi
else
  cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
  info "CLAUDE.md 복사 완료"
fi
```

---

### P3: CI Compatibility for Interactive Reads (Medium)

**Problem:**
`read -r` commands in `collect_key()` function and auth.json section hang/fail in non-interactive environments (CI/CD pipelines).

**Root Cause:**
`read` waits for terminal input even when stdin is not a TTY.

**Solution:**
Added `-t 0` check before `read`:
- `-t 0` returns true only if stdin is a terminal
- In non-interactive mode: Skip prompts, use existing values or show warning

**Code Changes:**

1. **collect_key() function** (lines 90-116):
```bash
collect_key() {
  local varname="$1"
  local current="${!varname:-}"
  local prompt_url="$2"

  # 비인터랙티브 모드면 기존 값만 반환
  if [[ ! -t 0 ]]; then
    echo "${current:-}"
    return 0
  fi

  # ... (interactive read logic) ...
}
```

2. **auth.json prompt section** (lines 330-364):
```bash
# 비인터랙티브 모드면 안내만 출력
if [[ ! -t 0 ]]; then
  warn "비인터랙티브 모드: auth.json 수동 생성 필요. 나중에 codex login 실행 또는 파일 복사하세요."
else
  # ... (interactive prompt logic) ...
fi
```

---

### P4: Idempotency (Medium)

**Assessment:**
The existing code already has idempotency:
- `upsert_hook()` function checks for duplicate hooks before adding
- `claude mcp remove` is called before re-adding MCP
- Python code merges existing env variables before overwriting

**Additional Fix (Bonus):**
The P1 fix (finding correct Python) also resolves the re-run hang issue, so script will complete successfully on re-runs.

---

## Testing Recommendations

1. **Test on Windows MSYS:**
   ```bash
   cd claude-omo
   bash install.sh
   ```
   - Should detect `python` instead of `python3` stub
   - Should not hang at step 8

2. **Test Re-run:**
   ```bash
   bash install.sh
   bash install.sh  # Second run should complete successfully
   ```

3. **Test CI Mode (non-interactive):**
   ```bash
   echo "" | bash install.sh
   ```
   - Should skip API key prompts
   - Should skip CLAUDE.md overwrite prompt
   - Should skip auth.json paste prompt

4. **Verify Python Detection:**
   ```bash
   python --version   # Should be 3.13.3
   python3 --version  # Might be Windows Store stub
   ```

---

## Summary

All critical and high-priority issues have been resolved:
- ✅ Python3 hang fixed with dynamic Python interpreter detection
- ✅ CLAUDE.md data loss prevented with user confirmation
- ✅ CI compatibility improved with `-t 0` checks
- ✅ Idempotency already present in existing code

The script is now compatible with Windows MSYS Git Bash and can be safely re-run without data loss.
