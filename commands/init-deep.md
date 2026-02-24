---
description: Generate hierarchical AGENTS.md files throughout the project for optimal agent context. Usage: /init-deep [--max-depth=N]
---

Generate hierarchical **AGENTS.md** context files for this project.

## What This Does

Creates directory-specific context files that agents auto-read when working in those directories:

```
project/
├── AGENTS.md              ← project-wide overview
├── src/
│   ├── AGENTS.md          ← src-specific patterns
│   └── components/
│       └── AGENTS.md      ← component conventions
```

These files make every agent smarter about your codebase with zero manual work.

## Process

### Step 1: Analyze Project Structure

Use Glob and Read to understand:
- Directory layout and purpose of each top-level folder
- Key config files (package.json, tsconfig.json, pyproject.toml, Cargo.toml, go.mod, etc.)
- Main entry points and architecture patterns
- Tech stack detection

### Step 2: Generate Root AGENTS.md

```markdown
# Project: [name]

## Architecture
[High-level description — 2-3 sentences]

## Tech Stack
[Languages, frameworks, key libraries with versions]

## Key Patterns
[Important conventions: naming, structure, state management, error handling]

## Directory Map
- `src/` — [purpose]
- `tests/` — [purpose]
- `docs/` — [purpose]
[only significant directories]

## Development Commands
- Build: [command]
- Test: [command]
- Lint: [command]
- Dev server: [command if applicable]

## Code Conventions
[Naming conventions, file organization, import style]
```

### Step 3: Generate Sub-directory AGENTS.md

For each significant directory (src/, lib/, components/, api/, handlers/, etc.) that contains non-trivial code:

```markdown
# [Directory Name]

## Purpose
[What this directory contains and why it exists]

## Conventions
[Naming patterns specific to this directory, file structure, export patterns]

## Key Files
[Most important files and their roles — max 5]

## Patterns
[Specific patterns used here — design patterns, abstractions, shared utilities]

## Dependencies
[What this directory imports from / what imports from here]
```

### Step 4: Skip These Directories
- `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.venv/`, `venv/`
- Any directory with only generated files

### Step 5: Verify and Report

List all generated AGENTS.md files:
```
Generated AGENTS.md files:
✅ ./AGENTS.md — project root
✅ ./src/AGENTS.md — main source
✅ ./src/components/AGENTS.md — React components
...
```

## Options
- Default: Generate for top-level + directories 1-2 levels deep
- `--max-depth=N`: Control depth of generation
- `--create-new`: Only create new files, skip existing ones
