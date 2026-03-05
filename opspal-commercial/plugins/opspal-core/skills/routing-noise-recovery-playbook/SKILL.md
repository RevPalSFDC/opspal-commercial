---
name: routing-noise-recovery-playbook
description: Harden routing under noisy or oversized transcript context using adaptive thresholds and recovery fallbacks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# routing-noise-recovery-playbook

Use this skill when implementing or reviewing hook safeguards for this protection area.

## Workflow

1. Detect risk signals and map them to concrete thresholds.
2. Apply block/warn/fallback behavior with deterministic output shaping.
3. Verify with explicit before/after checks and negative-path tests.

## References

- [Noise Scoring](./noise-scoring.md)
- [Adaptive Fallbacks](./adaptive-fallbacks.md)
- [Routing Verification](./routing-verification.md)
