---
name: marketo-instance-lifecycle-operations
description: Operate Marketo instance lifecycle hooks for session context, auth continuity, and instance quirk detection.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# marketo-instance-lifecycle-operations

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Session Bootstrap](./session-bootstrap.md)
- [Auth Lifecycle Controls](./auth-lifecycle.md)
- [Instance Quirk Capture](./quirk-capture.md)
