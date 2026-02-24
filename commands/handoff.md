---
description: Create a detailed context summary for continuing work in a new session. Usage: /handoff
---

Create a comprehensive handoff document for session continuity.

## Instructions

Generate a structured summary by analyzing the current session:

1. **Scan current state**: Read TodoWrite items, check recent file modifications, identify what's in progress
2. **Summarize progress**: What was accomplished, what's in progress, what's remaining
3. **Capture context**: Key decisions made, patterns discovered, blockers found

## Steps

### Step 1: Gather State
```bash
# Check git status if in a git repo
git status 2>/dev/null
git diff --stat HEAD 2>/dev/null
```

Read any `.claude/plans/*.md` files if they exist.

### Step 2: Write Handoff File

Write to `.claude/handoff.md`:

```markdown
# Session Handoff
Generated: [timestamp]

## What Was Done
- [completed task 1]
- [completed task 2]

## What's In Progress
- [in-progress task] — current state: [description]

## What Remains
- [ ] [remaining task 1]
- [ ] [remaining task 2]

## Key Decisions Made
- [decision 1]: [rationale]

## Important Files Modified
- `path/to/file1` — [what changed]
- `path/to/file2` — [what changed]

## Known Blockers
- [blocker description and potential solutions]

## How to Continue
1. [first step to resume]
2. [second step]

## Context for Next Session
[Any critical context the next agent needs to know]
```

### Step 3: Confirm

After writing, tell the user:

> "Handoff saved to `.claude/handoff.md`. Start your next session with: 'Read .claude/handoff.md and continue the work.'"
