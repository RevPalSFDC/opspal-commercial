---
name: marketo-bulk-import-recovery-playbook
description: Handle hook-driven post-bulk-import recovery, warning triage, and safe retry operations.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# marketo-bulk-import-recovery-playbook

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Bulk Import Summary Analysis](./import-summary.md)
- [Bulk Retry Policy](./retry-policy.md)
- [Post-Import Quality Feedback](./quality-feedback.md)
