---
name: tool-contract-engineering
description: Design and maintain pre/post tool contract validation hooks and failure triage patterns.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# tool-contract-engineering

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Pre-Tool Contract Validation](./pretool-contracts.md)
- [Post-Tool Contract Validation](./posttool-contracts.md)
- [Contract Failure Triage](./failure-triage.md)
