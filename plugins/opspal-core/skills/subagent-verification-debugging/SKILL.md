---
name: subagent-verification-debugging
description: Debug subagent lifecycle hooks, verification failures, and recurring subagent execution issues.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# subagent-verification-debugging

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Subagent Context Injection](./context-injection.md)
- [Post-Subagent Verification](./postverify.md)
- [Recurring Failure Detection](./recurrence-detection.md)
