---
name: field-metadata-dependency-matrix-integrity-framework
description: Enforce field-level metadata dependency integrity across record types, picklists, and formulas.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# field-metadata-dependency-matrix-integrity-framework

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Dependency Matrix](./dependency-matrix.md)
- [Static Validation](./static-validation.md)
- [Rollout Controls](./rollout-controls.md)
