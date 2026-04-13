---
name: hook-payload-budget-guard
description: Apply input payload byte budgets for hook stdin/tool args with consistent warn/block handling.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-payload-budget-guard

## When to Use This Skill

- A hook receives tool input (`tool_input` JSON) whose size is unbounded — e.g., a `Write` hook receiving a large file body
- A hook is crashing or timing out because stdin payload exceeds shell buffer limits
- You need to enforce a per-hook byte budget on `tool_args` before the hook script processes them
- A routing hook is receiving oversized transcript context that inflates routing decisions
- A new hook is being added that reads from stdin and has no explicit size guard

**Not for**: post-processing output trimming after Claude has already received a response — see `hook-context-pruning-patterns` for that.

## Payload Budget Tiers

| Tier | Byte Limit | Hook Action | Example Hook |
|------|-----------|-------------|--------------|
| Micro | 4 KB | warn if exceeded | PreToolUse: Read |
| Standard | 32 KB | block if exceeded | PreToolUse: Write, Bash |
| Bulk | 256 KB | block; request chunking | PreToolUse: mcp__sfdc__bulk |
| Passthrough | unlimited | no guard | Stop, Notification |

## Workflow

1. **Identify the hook's stdin source**: read the hook script to determine what feeds its stdin — `tool_input`, `tool_result`, or injected context.
2. **Measure worst-case payload**: instrument the hook to log `wc -c` of stdin for a representative set of tool invocations.
3. **Select the appropriate tier**: match the hook's tool type against the tier table; assign the byte limit and action.
4. **Insert the budget guard**: add a size check at the top of the hook script before any parsing:
   ```bash
   PAYLOAD=$(cat)
   PAYLOAD_SIZE=${#PAYLOAD}
   if [ "$PAYLOAD_SIZE" -gt 32768 ]; then
     echo '{"action":"block","reason":"payload exceeds 32KB budget"}' >&2
     exit 2
   fi
   ```
5. **Emit a structured overflow notice**: write the block decision as a JSON envelope to stderr so audit logs capture it; reference `./overflow-handling.md` for the canonical envelope format.
6. **Test positive and negative paths**: send a 1-byte payload (allow), a boundary payload (warn), and an over-limit payload (block); assert the correct exit code and JSON output for each.

## References

- [Input Budget Contract](./input-budget-contract.md)
- [Overflow Handling](./overflow-handling.md)
- [Rollout Strategy](./rollout-strategy.md)
