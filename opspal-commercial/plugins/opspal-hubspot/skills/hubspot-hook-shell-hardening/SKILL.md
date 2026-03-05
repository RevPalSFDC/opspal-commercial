---
name: hubspot-hook-shell-hardening
description: Apply consistent shell strictness and non-interactive safety defaults across HubSpot hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-shell-hardening

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Strict Mode Policy](./strict-mode-policy.md)
- [Safe Commands](./safe-commands.md)
- [Downgrade Guidelines](./downgrade-guidelines.md)
