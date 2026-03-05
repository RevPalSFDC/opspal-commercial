---
name: xml-roundtrip-fidelity-framework
description: Preserve Salesforce metadata XML semantic fidelity across parse, transform, and reserialization paths.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# xml-roundtrip-fidelity-framework

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Parse Contract](./parse-contract.md)
- [Transform Invariants](./transform-invariants.md)
- [Roundtrip Verification](./roundtrip-verification.md)
