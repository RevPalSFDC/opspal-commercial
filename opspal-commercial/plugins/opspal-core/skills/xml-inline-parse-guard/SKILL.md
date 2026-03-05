---
name: xml-inline-parse-guard
description: Harden inline XML ingestion paths with format detection, parser safety, and policy-aware validation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# xml-inline-parse-guard

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Format Detection](./format-detection.md)
- [Parser Safety](./parser-safety.md)
- [Policy Overlays](./policy-overlays.md)
