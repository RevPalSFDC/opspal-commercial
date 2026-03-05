---
name: marketo-change-safety-guardrails
description: Apply hook guardrails for high-impact Marketo mutation operations with preflight checks and rollback safety.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# marketo-change-safety-guardrails

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Mutation Preflight Controls](./preflight-mutation.md)
- [Campaign Operation Guards](./campaign-guards.md)
- [Rollback Safety Expectations](./rollback-safety.md)
