---
name: atomic-json-state-manager
description: Use atomic, race-safe JSON state persistence patterns for Marketo hooks and observability flows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# atomic-json-state-manager

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Atomic Write Pattern](./atomic-write-pattern.md)
- [Concurrency Controls](./concurrency-controls.md)
- [Corruption Recovery](./corruption-recovery.md)
