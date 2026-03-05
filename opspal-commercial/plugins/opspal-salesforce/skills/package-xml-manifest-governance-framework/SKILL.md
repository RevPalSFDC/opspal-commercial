---
name: package-xml-manifest-governance-framework
description: Harden package.xml interpretation and enforcement for metadata dependency safety.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# package-xml-manifest-governance-framework

Use this skill when implementing or reviewing this hook control surface.

## Workflow

1. Identify input/output contract and failure modes.
2. Apply deterministic parsing, validation, and fallback rules.
3. Verify behavior with explicit pass, fail, and degraded-mode checks.

## References

- [Manifest Parsing](./manifest-parsing.md)
- [Dependency Coverage](./dependency-coverage.md)
- [Deployment Gates](./deployment-gates.md)
