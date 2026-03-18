---
name: runbook-policy-operations
description: Operate hook-based runbook policy injection and compliance checks for operational workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# runbook-policy-operations

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Runbook Injection Operations](./runbook-injection.md)
- [Runbook Reminder Enforcement](./reminder-enforcement.md)
- [Post-Task Compliance Checks](./compliance-checks.md)
