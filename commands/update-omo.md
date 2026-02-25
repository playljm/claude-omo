---
name: update-omo
description: claude-omo 레포 변경사항을 C:\dev\.claude\ 및 ~/.claude/에 동기화하고 GitHub에 push합니다.
user-invocable: true
metadata:
  version: "1.0.0"
  category: "workflow"
  updated: "2026-02-25"
---

claude-omo 레포의 변경사항을 배포하고 GitHub에 push합니다.

**Arguments**: `$ARGUMENTS` (옵션: 커밋 메시지. 없으면 자동 생성)

---

## 실행 순서

### Step 1 — 변경사항 확인

```bash
git -C "C:/dev/claude-omo" status --short
```

변경사항이 없으면 "변경사항 없음" 출력 후 종료.

### Step 2 — C:\dev\.claude\ 동기화 (프로젝트 레벨)

```bash
REPO="C:/dev/claude-omo"
PROJ="C:/dev/.claude"

mkdir -p "$PROJ/agents" "$PROJ/commands"
cp -f "$REPO"/agents/*.md "$PROJ/agents/"
cp -f "$REPO"/commands/*.md "$PROJ/commands/"

echo "agents: $(ls $PROJ/agents/*.md | wc -l)개, commands: $(ls $PROJ/commands/*.md | wc -l)개 동기화 완료"
```

### Step 3 — ~/.claude/ 동기화 (글로벌)

```bash
GLOBAL="$USERPROFILE/.claude"

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

### Step 4 — Git 커밋 & Push

```bash
cd "C:/dev/claude-omo"
git add -A

# 변경사항 있을 때만 커밋
if ! git diff --cached --quiet; then
  MSG="${ARGUMENTS:-sync: $(date '+%Y-%m-%d %H%M')}"
  git commit -m "$MSG"
  git push origin master
  echo "GitHub push 완료"
fi
```

### Step 5 — 완료 보고

변경된 파일 목록, 커밋 해시, 동기화된 파일 수를 요약합니다.

> **주의:** `mcp-server/` 내 파일(index.js, hooks 등) 변경 시 Claude Code 재시작 필요.
> MCP 재등록이 필요하면 `bash C:/dev/claude-omo/install.sh` 실행.
