---
description: Stop all continuation mechanisms (ralph loop, ulw-loop, todo continuation) for this session. Usage: /stop-continuation
---

## Stop All Continuation

You are stopping all active continuation mechanisms.

### Actions

1. **Acknowledge the stop request**: "Stopping all continuation mechanisms."

2. **Report current state**:
   - List any in-progress TodoWrite items
   - Note what was completed vs. what remains
   - Save state if meaningful work was done

3. **Create a brief status note**:
   ```
   STOPPED at: [timestamp]
   Completed: [N] tasks
   Remaining: [list uncompleted todos]
   ```

4. **Confirm to user**: "All continuation mechanisms stopped. You can resume with `/ralph-loop` or `/ulw-loop` when ready."

### After Stopping

The agent will NOT:
- Continue working on incomplete todos
- Auto-resume after this message
- Keep looping

The agent WILL:
- Answer questions normally
- Respond to new instructions
- Start fresh loops if explicitly asked
