---
name: hook-log-retention-and-rotation-framework
description: Standardize Salesforce hook log size rotation and retention to prevent oversized files and runaway disk growth.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-log-retention-and-rotation-framework

Use this skill when implementing or reviewing hook safeguards for this protection area.

## Workflow

1. Detect risk signals and map them to concrete thresholds.
2. Apply block/warn/fallback behavior with deterministic output shaping.
3. Verify with explicit before/after checks and negative-path tests.

## References

- [Rotation Policy](./rotation-policy.md)
- [Retention Policy](./retention-policy.md)
- [Operations Checks](./operations-checks.md)
