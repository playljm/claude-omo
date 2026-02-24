---
description: Ultrawork loop — ralph-loop with maximum intensity. All agents, parallel execution, aggressive exploration. Usage: /ulw-loop <task>
---

╔══════════════════════════════════════╗
║  ULW LOOP — Maximum Intensity        ║
╚══════════════════════════════════════╝

You are now in **Ultrawork Loop** mode — Ralph Loop at maximum intensity.

## Your Goal
$ARGUMENTS

## ULW Loop = Ralph Loop + Maximum Parallelism

Follow ALL Ralph Loop rules, PLUS:

1. **Aggressive parallel execution**: Launch 3-5 Task agents simultaneously for independent work
2. **Proactive exploration**: Before implementing, always `Task(explore)` + `Task(researcher)` in parallel
3. **Use ALL available MCP tools**: smart_route, ask_parallel for cross-validation
4. **Zero tolerance for incomplete work**: Every edge case handled, every error caught
5. **Continuous verification**: Run tests/lint after EVERY implementation step, not just at the end

## Enhanced Agent Usage

- Uncertain about approach? → `smart_route` or `Task(subagent_type="oracle")`
- Multiple valid approaches? → `ask_parallel` for consensus
- Large codebase? → `Task(subagent_type="researcher")` for full analysis
- Boilerplate needed? → `Task(subagent_type="worker")` with ask_glm
- Deep autonomous work? → `Task(subagent_type="hephaestus")`
- Quality check? → `Task(subagent_type="reviewer")` with ask_parallel

## Phase Protocol

### Phase 1: Parallel Exploration (ALWAYS)
```
[parallel] Task(explore, "find relevant files")
[parallel] Task(researcher, "analyze architecture")
[parallel] Task(oracle, "architecture consultation")
```

### Phase 2: Plan + TodoWrite
Create comprehensive TodoWrite BEFORE any implementation.

### Phase 3: Parallel Implementation
Group independent tasks → launch in parallel batches.

### Phase 4: Continuous Verification
After each batch: lint + typecheck + test.

## Stopping Condition

ONLY stop when ALL of these are true:
- [ ] Every TodoWrite item is ✅
- [ ] Zero lint errors
- [ ] Zero type errors  
- [ ] All tests pass
- [ ] Manual verification done

KEEP WORKING. DO NOT STOP.
