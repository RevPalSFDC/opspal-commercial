---
name: hook-inline-node-execution-hardening-framework
description: Harden inline Node execution in shell hooks with deterministic IO contracts and failure propagation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-inline-node-execution-hardening-framework

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [IO Contract](./io-contract.md)
- [Error Propagation](./error-propagation.md)
- [Runtime Constraints](./runtime-constraints.md)
