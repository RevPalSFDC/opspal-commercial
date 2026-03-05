---
name: hook-payload-canonicalizer
description: Canonicalize reconstructed hook payloads to avoid regex-induced JSON corruption in shell flows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-payload-canonicalizer

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Canonicalization Rules](./canonicalization-rules.md)
- [Reconstruction Safeguards](./reconstruction-safeguards.md)
- [Conformance Tests](./conformance-tests.md)
