---
name: hubspot-output-path-governance
description: Enforce hook-based output path and artifact placement governance for generated HubSpot artifacts.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-output-path-governance

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Output Path Validation](./path-validation.md)
- [Artifact Classification Rules](./artifact-classification.md)
- [Nonblocking Guidance Patterns](./nonblocking-guidance.md)
