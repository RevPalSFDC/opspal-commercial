---
name: routing-noise-recovery-playbook
description: Harden routing under noisy or oversized transcript context using adaptive thresholds and recovery fallbacks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# routing-noise-recovery-playbook

## When to Use This Skill

- The routing hook is firing sub-agent recommendations on simple, direct tasks (false-positive noise)
- A long or compacted session transcript is inflating the complexity score because the router is reading irrelevant prior context
- Routing decisions oscillate between recommend and block within the same session, indicating threshold instability
- The `routing.jsonl` log shows complexity scores consistently at the boundary (0.65–0.75) for tasks that users are manually overriding with `[DIRECT]`
- A context compaction event has degraded the quality of routing signal and the session needs recovery

**Not for**: persistent routing misconfiguration — use `routing-governance-playbook` to tune thresholds and rules structurally.

## Noise Signal Classification

| Signal | Noise Indicator | Recovery Action |
|--------|----------------|-----------------|
| Complexity score > 0.65 on simple tasks | Transcript bloat inflating score | Apply context pruning before routing |
| Score oscillation ±0.1 across consecutive tasks | Boundary instability | Temporarily raise block threshold by 0.05 |
| >3 `[DIRECT]` overrides in one session | Routing over-triggering | Enter advisory-only mode for session remainder |
| Score > 0.9 on tasks with `[DIRECT]` prefix | Router ignoring override signal | Check override detection logic in routing hook |
| Low score after compaction event | Context loss degrading signal | Inject routing context summary from pre-compact snapshot |

## Workflow

1. **Identify the noise signal**: check `~/.claude/logs/routing.jsonl` for the last 10 routing decisions; classify the pattern against the noise signal table above.
2. **Measure transcript context size**: run the routing hook with `ROUTING_VERBOSE=1` to capture the token count being fed to the complexity scorer; if over 8 KB, apply context pruning via `hook-context-pruning-patterns`.
3. **Apply adaptive threshold**: if boundary instability is detected, temporarily set `ROUTING_NOISE_THRESHOLD_OFFSET=0.05` in the session env to raise the effective block threshold; log the adjustment.
4. **Switch to advisory-only mode**: if noise persists after pruning, set `ENABLE_AGENT_BLOCKING=0` for the remainder of the session so routing recommendations are surfaced but not enforced.
5. **Verify recovery**: run the next 3 tasks normally and confirm routing decisions match user intent; check that complexity scores have stabilized below the warn threshold for simple tasks.
6. **Capture a routing verification snapshot**: run `/routing-health` and save the output as evidence; reference `./routing-verification.md` for the expected healthy state.
7. **Schedule governance review**: if noise recurs across sessions, file a routing governance action using `routing-governance-playbook` to address the root cause structurally.

## References

- [Noise Scoring](./noise-scoring.md)
- [Adaptive Fallbacks](./adaptive-fallbacks.md)
- [Routing Verification](./routing-verification.md)
