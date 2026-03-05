---
name: hubspot-hook-skill-sync-governance
description: Keep HubSpot skill references synchronized with actual hook file names and trigger surfaces.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-skill-sync-governance

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Reference Audit](./reference-audit.md)
- [Drift Detection](./drift-detection.md)
- [Update Protocol](./update-protocol.md)
