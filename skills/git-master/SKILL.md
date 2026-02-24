---
name: git-master
description: "Git expert for atomic commits, rebase surgery, and history archaeology. MUST USE for ANY git operations. Triggers: commit, rebase, squash, 'who wrote', 'when was X added', 'find the commit that'."
---

# git-master — Git Expert Skill

당신은 git-master 스킬이 활성화된 상태입니다.
모든 git 작업을 전문 엔지니어 수준으로 처리합니다.

## Core Principle: Atomic Commits

**Multiple files = Multiple commits. ALWAYS.**

| Changed Files | Minimum Commits |
|---|---|
| 3+ files | 2+ commits |
| 5+ files | 3+ commits |
| 10+ files | 5+ commits |

단, 하나의 논리적 변경사항이면 파일 수와 무관하게 1 commit 가능.

## Automatic Style Detection

커밋 전 반드시 실행:
```bash
git log --oneline -30
```

감지 항목:
- **언어**: 한국어 vs 영어 커밋 메시지
- **스타일**: Conventional (feat/fix/chore), plain ("Add ...", "Fix ..."), short (한 단어)
- **대소문자**: lowercase vs Capitalized

감지된 스타일을 정확히 따름.

## Three Specializations

### 1. Commit Architect

**목적**: 원자적 커밋, 올바른 순서, 스타일 일관성

프로토콜:
```bash
git diff --stat          # 모든 변경 파악
git diff                 # 상세 내용 검토
```

1. 변경사항을 논리적 단위로 그룹화
2. 의존성 순서대로 커밋 (기반 변경 → 파생 변경)
3. WHY를 설명하는 메시지 (WHAT 금지)
4. 각 그룹을 개별 `git add` + `git commit`

**좋은 커밋 메시지**:
- `feat: add user authentication with JWT`
- `fix: resolve race condition in session management`
- `refactor: extract payment validation into separate module`

**나쁜 커밋 메시지**:
- `update files`
- `changes`
- `WIP`

### 2. Rebase Surgeon

**목적**: 히스토리 정리, 스쿼시, 리오더

```bash
git log --oneline main..HEAD     # 커밋 범위 확인
git rebase -i main               # 인터랙티브 리베이스
```

전략:
- squash: 관련 WIP 커밋들
- reorder: 논리적 순서로
- split: 너무 큰 커밋
- fixup: 이전 커밋의 수정사항

### 3. History Archaeologist

**목적**: 언제, 누가, 왜 이 코드를 썼는지 찾기

```bash
git log -S "pattern" --source -p   # 코드가 추가된 시점
git blame path/to/file             # 라인별 작성자
git bisect start                   # 버그 도입 시점 이진탐색
git log --follow -p path/to/file   # 파일 전체 히스토리
```

## Usage Examples

```
/git-master commit these changes
/git-master rebase onto main
/git-master who wrote this authentication code?
/git-master when was the rate limiting added?
/git-master squash the last 3 commits
```
