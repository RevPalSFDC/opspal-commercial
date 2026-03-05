---
name: precommit-quality-enforcement-framework
description: Enforce pre-commit hook quality gates for secrets, silent failures, mock data, and boundary violations.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# precommit-quality-enforcement-framework

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Quality Gate Matrix](./quality-gate-matrix.md)
- [Credential and Boundary Scanning](./credential-scanning.md)
- [Error Handling and Mock Linting](./error-handling-lint.md)
