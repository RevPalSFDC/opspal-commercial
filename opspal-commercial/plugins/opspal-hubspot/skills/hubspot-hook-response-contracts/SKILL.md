---
name: hubspot-hook-response-contracts
description: Normalize HubSpot pre-hook outputs with machine-readable decision envelopes and human diagnostics.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-response-contracts

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Decision Schema](./decision-schema.md)
- [Stderr vs Stdout](./stderr-vs-stdout.md)
- [Rejection Guidance](./rejection-guidance.md)
