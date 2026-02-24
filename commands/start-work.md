---
description: Start execution from a Prometheus-generated plan. Activates Atlas orchestration mode. Usage: /start-work [plan-name]
---

# Start Work: Execute Plan

## Instructions

1. **Find the plan**: Look in `.claude/plans/` for the latest plan file
   - If `$ARGUMENTS` specifies a plan name, use that
   - Otherwise, use the most recently created plan file

2. **Load the plan**: Read the plan file fully

3. **Activate Atlas mode**: Execute the plan systematically:
   - Convert plan steps to TodoWrite items immediately
   - Respect dependency ordering from the plan
   - Delegate to appropriate agents:
     - `Task(subagent_type="explore")` — file discovery
     - `Task(subagent_type="researcher")` — code analysis
     - `Task(subagent_type="worker")` — boilerplate/CRUD
     - `Task(subagent_type="hephaestus")` — deep autonomous work
     - `Task(subagent_type="oracle")` — architecture guidance
     - `Task(subagent_type="reviewer")` — code review
   - Run independent tasks in parallel
   - Verify each step completion

4. **Continuous verification**: After each implementation step:
   ```bash
   # Run project-appropriate verification
   # (lint/typecheck/test — adapt to project stack)
   ```

5. **Accumulate learnings**: After each completed step, note:
   - Patterns discovered
   - Conventions to follow
   - Gotchas to avoid
   Pass these forward to subsequent tasks.

6. **Completion**: When all plan steps are done:
   - Run full verification suite
   - Report what was accomplished
   - Note any deviations from the original plan

## Anti-Stall Rules

- If stuck on a step for 2+ attempts → `Task(oracle)` for guidance
- If a step is blocked → skip, continue with unblocked steps, return later
- If plan is outdated → adapt (document deviations)
- NEVER stop with incomplete work

## No Plan Found?

If no plan exists in `.claude/plans/`:
- Suggest running `/plan` first to create one via Prometheus interview mode
- Or ask the user to describe the task and create a quick plan directly
