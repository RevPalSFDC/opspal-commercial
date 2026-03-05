---
name: precommit-large-file-gate
description: Implement staged-file size gates in pre-commit hooks with allowlists and actionable block messages.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# precommit-large-file-gate

Use this skill when implementing or reviewing hook safeguards for this protection area.

## Workflow

1. Detect risk signals and map them to concrete thresholds.
2. Apply block/warn/fallback behavior with deterministic output shaping.
3. Verify with explicit before/after checks and negative-path tests.

## References

- [Thresholds and Allowlists](./thresholds-and-allowlists.md)
- [Enforcement Pattern](./enforcement-pattern.md)
- [Test Matrix](./test-matrix.md)
