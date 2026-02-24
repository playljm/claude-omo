---
description: Intelligent refactoring with LSP, AST-grep, architecture analysis, and TDD verification. Usage: /refactor <target> [--scope=file|module|project] [--strategy=safe|aggressive]
---

# Intelligent Refactoring

**Target**: $ARGUMENTS

## Phase 1: Analysis (NEVER SKIP)

### 1.1 Understand Current State
- Read the target code thoroughly with `Read`
- Use `lsp_find_references` to find ALL usages across workspace
- Use `lsp_symbols` to understand structure
- Use `ast_grep_search` to find patterns

```
lsp_find_references(file, line, character)
lsp_symbols(filePath, scope="workspace", query="TargetName")
ast_grep_search(pattern="fn $NAME($$$) { $$$ }", lang="rust")
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

### 1.4 Check for Diagnostics
```
lsp_diagnostics(filePath="target/file.ts", severity="all")
```

## Phase 2: Plan

Create TodoWrite with:
1. What specific changes will be made (concrete, not vague)
2. Order of changes (dependencies first)
3. Verification step after each change
4. Rollback plan if things break

## Phase 3: Execute (Incremental)

For EACH change:
1. Make the change (prefer `lsp_rename` for symbol renames)
2. Check diagnostics immediately: `lsp_diagnostics`
3. Run tests
4. If tests fail → revert that specific change → try alternative approach

**Use LSP tools for precision**:
- Symbol rename → `lsp_rename` (propagates to ALL usages automatically)
- Find all callers → `lsp_find_references`
- Structural rewrite → `ast_grep_replace` (dry run first with `dryRun: true`)

## Phase 4: Verify

Final checklist:
- [ ] `lsp_diagnostics` — zero errors
- [ ] All existing tests pass
- [ ] No new lint warnings
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
Full workspace refactoring — requires `lsp_rename` for all symbol changes.
