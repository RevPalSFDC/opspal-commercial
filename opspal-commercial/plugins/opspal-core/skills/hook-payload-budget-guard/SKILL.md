---
name: hook-payload-budget-guard
description: Apply input payload byte budgets for hook stdin/tool args with consistent warn/block handling.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-payload-budget-guard

Use this skill when implementing or reviewing hook safeguards for this protection area.

## Workflow

1. Detect risk signals and map them to concrete thresholds.
2. Apply block/warn/fallback behavior with deterministic output shaping.
3. Verify with explicit before/after checks and negative-path tests.

## References

- [Input Budget Contract](./input-budget-contract.md)
- [Overflow Handling](./overflow-handling.md)
- [Rollout Strategy](./rollout-strategy.md)
