---
name: report-dashboard-validator-contract-adapter-framework
description: Keep hook-call contracts aligned with report/dashboard validator module exports and payload shapes.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# report-dashboard-validator-contract-adapter-framework

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Export Contract Map](./export-contract-map.md)
- [Adapter Patterns](./adapter-patterns.md)
- [Regression Tests](./regression-tests.md)
