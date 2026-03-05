---
name: hubspot-hook-input-contracts
description: Standardize HubSpot hook input parsing across stdin event JSON and argv fallback modes.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-input-contracts

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Input Priority](./input-priority.md)
- [Required Fields](./required-fields.md)
- [Compatibility Mode](./compatibility-mode.md)
