---
name: hook-context-pruning-patterns
description: Design deterministic context trimming for hooks to prevent oversized prompt injection and degraded routing quality.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-context-pruning-patterns

Use this skill when implementing or reviewing hook safeguards for this protection area.

## Workflow

1. Detect risk signals and map them to concrete thresholds.
2. Apply block/warn/fallback behavior with deterministic output shaping.
3. Verify with explicit before/after checks and negative-path tests.

## References

- [Deterministic Pruning Order](./pruning-order.md)
- [Fallback Semantics](./fallback-semantics.md)
- [Verification Checklist](./verification-checklist.md)
