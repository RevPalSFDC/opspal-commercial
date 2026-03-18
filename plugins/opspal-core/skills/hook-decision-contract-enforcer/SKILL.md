---
name: hook-decision-contract-enforcer
description: Standardize hook decision envelopes and exit-code semantics across policy enforcement paths.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-decision-contract-enforcer

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Decision Envelope](./decision-envelope.md)
- [Exit-Code Mapping](./exit-code-mapping.md)
- [Observability Tags](./observability-tags.md)
