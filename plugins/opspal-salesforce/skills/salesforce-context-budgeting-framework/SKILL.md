---
name: salesforce-context-budgeting-framework
description: Control Salesforce hook-injected context size with deterministic prioritization, token budgets, and overflow markers.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# salesforce-context-budgeting-framework

Use this skill when implementing or reviewing hook safeguards for this protection area.

## Workflow

1. Detect risk signals and map them to concrete thresholds.
2. Apply block/warn/fallback behavior with deterministic output shaping.
3. Verify with explicit before/after checks and negative-path tests.

## References

- [Injection Priority](./injection-priority.md)
- [Budget Thresholds](./budget-thresholds.md)
- [Overflow Notices](./overflow-notices.md)
