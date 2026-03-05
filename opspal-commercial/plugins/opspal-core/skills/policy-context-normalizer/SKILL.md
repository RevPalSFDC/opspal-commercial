---
name: policy-context-normalizer
description: Normalize policy-enforcement context inputs into stable schemas before routing and rule evaluation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# policy-context-normalizer

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Context Schema](./context-schema.md)
- [Inference Guards](./inference-guards.md)
- [Fail-Mode Policy](./fail-mode-policy.md)
