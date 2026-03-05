---
name: hubspot-hook-subprocess-and-tempfile-safety
description: Enforce subprocess dependency checks and tempfile lifecycle safety in HubSpot hook scripts.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-subprocess-and-tempfile-safety

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Dependency Preflight](./dependency-preflight.md)
- [Tempfile Lifecycle](./tempfile-lifecycle.md)
- [Subprocess Failure Modes](./subprocess-failure-modes.md)
