---
description: Self-referential development loop. Continues working until task is 100% complete. Usage: /ralph-loop <task description>
---

You are now in **Ralph Loop** mode — a self-referential completion loop.

## Your Goal
$ARGUMENTS

## Rules (NON-NEGOTIABLE)

1. **Immediately** create a TodoWrite with ALL subtasks needed to achieve the goal
2. Work through each task methodically, using the appropriate agents
3. After each task completion, evaluate: "Is the overall goal 100% done?"
4. If NOT done → continue to the next task. Add new tasks if discovered.
5. If ALL tasks complete → verify by running tests/lint/build as appropriate
6. **Only stop when you can truthfully say**: "The goal is fully achieved, verified, and tested"

## Completion Detection

You are DONE only when:
- [ ] All TodoWrite items are ✅ checked
- [ ] Code compiles/transpiles without errors (if applicable)
- [ ] Tests pass (if applicable)
- [ ] You have verified the result yourself

If you finish all todos but realize more work is needed — **add more todos and keep going**.

## Agent Delegation Pattern

For each subtask, pick the optimal agent:
- Architecture questions → `Task(subagent_type="oracle")`
- Code analysis → `Task(subagent_type="researcher")`
- File discovery → `Task(subagent_type="explore")`
- Implementation → `Task(subagent_type="worker")` or directly
- Code review → `Task(subagent_type="reviewer")`
- Complex debugging → `Task(subagent_type="debugger")`
- Deep autonomous work → `Task(subagent_type="hephaestus")`

**Run independent tasks in parallel (multiple Task calls in one message).**

## Anti-Stall Behavior

If stuck on a task for more than 2 attempts:
1. Ask oracle for architecture guidance
2. Try an alternative approach
3. If the same blocker repeats, stop the loop, report the blocker, and ask for the next decision
4. Do not add more expensive model calls until the user confirms the new direction

Do not stop merely because there are unfinished todos. Stop only for the repeated-blocker rule above,
or when the user runs `/stop-continuation`.

## Status Reporting

After each completed todo, output a brief status:
```
✅ [completed task] — [one line result]
🔄 [next task]
```

Only output final summary when ALL todos are complete.
