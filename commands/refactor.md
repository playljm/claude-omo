---
description: Intelligent refactoring with architecture analysis and TDD verification. Usage: /refactor <target> [--scope=file|module|project] [--strategy=safe|aggressive]
---

# Intelligent Refactoring

**Target**: $ARGUMENTS

## Phase 1: Analysis (NEVER SKIP)

### 1.1 Understand Current State
- Read the target code thoroughly with `Read`
- Use `Grep` to find ALL usages across workspace
- Use `Glob` to map file structure

```bash
# 심볼 참조 찾기
Grep("TargetFunctionName", output_mode="content")
# 관련 파일 파악
Glob("**/*.{ts,js,py}")
```

### 1.2 Architecture Assessment via Oracle
```
Task(subagent_type="oracle", prompt="
  Analyze this code and advise on refactoring approach:
  [paste relevant code]
  Key questions: What is the responsibility boundary? What are the risks?
")
```

### 1.3 Create Baseline
```bash
# Run existing tests FIRST — document baseline
[test command] 2>&1
```
**ALL existing tests must still pass after refactoring.**

### 1.4 Check for Type/Lint Errors
```bash
# TypeScript 프로젝트
npx tsc --noEmit 2>&1
# JS/Python
npx eslint src/ 2>&1  또는  ruff check . 2>&1
```

## Phase 2: Plan

Create TodoWrite with:
1. What specific changes will be made (concrete, not vague)
2. Order of changes (dependencies first)
3. Verification step after each change
4. Rollback plan if things break

## Phase 3: Execute (Incremental)

For EACH change:
1. Make the change with `Edit` (검증된 old_string 사용)
2. 변경 후 즉시 Grep으로 누락 참조 확인
3. Run tests
4. If tests fail → revert that specific change → try alternative approach

**심볼 전체 rename 시**:
```bash
# Grep으로 전체 참조 수 파악
Grep("OldName", output_mode="count")
# Edit replace_all=true 또는 Bash sed로 일괄 치환
```

## Phase 4: Verify

Final checklist:
- [ ] Type/lint check — zero errors
- [ ] All existing tests pass
- [ ] No new warnings
- [ ] Behavior preserved (same inputs → same outputs)
- [ ] Code is simpler/cleaner than before

## Strategy Guide

### `--strategy=safe` (default)
- Only refactor with full test coverage
- One logical change at a time
- Verify after each change
- No behavior changes, only structure

### `--strategy=aggressive`
- Larger transformations allowed
- Still requires tests
- Document any behavior changes
- Use `ask_parallel` for cross-validation of controversial decisions

### `--scope=file`
Only refactor the specified file, no cross-file changes.

### `--scope=module`
Refactor within the directory boundary.

### `--scope=project`
Full workspace refactoring — use Grep+Edit replace_all for all symbol changes.
