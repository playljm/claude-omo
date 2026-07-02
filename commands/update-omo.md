---
description: claude-omo 레포 변경사항을 프로젝트/글로벌 .claude 디렉터리에 동기화하고 GitHub에 push합니다. Usage: /update-omo [커밋 메시지]
---

claude-omo 레포의 변경사항을 배포하고 GitHub에 push합니다.

**Arguments**: `$ARGUMENTS` (옵션: 커밋 메시지. 없으면 자동 생성)

---

## 실행 순서

### Step 0 — 레포 경로 결정 (OS 분기)

```bash
if [ -d "$HOME/dev/claude-omo" ]; then
  REPO="$HOME/dev/claude-omo"
elif [ -d "C:/dev/claude-omo" ]; then
  REPO="C:/dev/claude-omo"
else
  echo "claude-omo 레포를 찾을 수 없습니다 (~/dev/claude-omo 또는 C:/dev/claude-omo)"
  exit 1
fi
PROJ="$(dirname "$REPO")/.claude"
```

### Step 1 — 변경사항 확인

```bash
git -C "$REPO" status --short
```

변경사항이 없으면 "변경사항 없음" 출력 후 종료.

### Step 2 — 검증

```bash
if [ -f "$REPO/mcp-server/package.json" ]; then
  (
    cd "$REPO/mcp-server"
    npm ci
    npm test
    npm run selftest
    npm audit --omit=dev
  )
fi

bash -n "$REPO/install.sh"
```

검증 실패 시 동기화·커밋·push 금지.

### Step 3 — 프로젝트 레벨 .claude 동기화

```bash
mkdir -p "$PROJ/agents" "$PROJ/commands"
cp -f "$REPO"/agents/*.md "$PROJ/agents/"
cp -f "$REPO"/commands/*.md "$PROJ/commands/"

echo "agents: $(ls "$PROJ"/agents/*.md | wc -l)개, commands: $(ls "$PROJ"/commands/*.md | wc -l)개 동기화 완료"
```

### Step 4 — ~/.claude/ 동기화 (글로벌)

```bash
if [ -n "$USERPROFILE" ]; then
  GLOBAL="$USERPROFILE/.claude"
else
  GLOBAL="$HOME/.claude"
fi

# 디렉토리가 이미 존재하는 경우만 업데이트 (최초 설치는 install.sh 사용)
[ -d "$GLOBAL/agents" ]   && cp -f "$REPO"/agents/*.md "$GLOBAL/agents/" && echo "글로벌 agents 업데이트"
[ -d "$GLOBAL/commands" ] && cp -f "$REPO"/commands/*.md "$GLOBAL/commands/" && echo "글로벌 commands 업데이트"
[ -d "$GLOBAL/skills" ]   && cp -rf "$REPO"/skills/. "$GLOBAL/skills/" && echo "글로벌 skills 업데이트"

# CLAUDE.md 변경 여부 확인 후 업데이트
if ! diff -q "$REPO/CLAUDE.md" "$GLOBAL/CLAUDE.md" >/dev/null 2>&1; then
  cp -f "$REPO/CLAUDE.md" "$GLOBAL/CLAUDE.md"
  echo "CLAUDE.md 업데이트"
fi
```

### Step 5 — Git 커밋 & Push

```bash
cd "$REPO"
STAGE_PATHS=(
  ".github"
  "agents"
  "commands"
  "skills"
  "mcp-server"
  "CHANGELOG.md"
  "CLAUDE.md"
  "README.md"
  "TROUBLESHOOT.md"
  "WINDOWS_FIXES.md"
  "install.sh"
  "update.bat"
)
git add -- "${STAGE_PATHS[@]}"

# 변경사항 있을 때만 커밋
if ! git diff --cached --quiet; then
  MSG="${ARGUMENTS:-sync: $(date '+%Y-%m-%d %H%M')}"
  git commit -m "$MSG"
  git push origin master
  echo "GitHub push 완료"
fi
```

### Step 6 — 완료 보고

변경된 파일 목록, 커밋 해시, 동기화된 파일 수를 요약합니다.

> **주의:** `mcp-server/` 내 파일(index.js, hooks 등) 변경 시 Claude Code 재시작 필요.
> MCP 재등록이 필요하면 `bash "$REPO/install.sh"` 실행.
