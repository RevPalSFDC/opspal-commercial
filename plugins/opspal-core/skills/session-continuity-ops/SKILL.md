---
name: session-continuity-ops
description: Operate session continuity hooks for scratchpad persistence, context hydration, and transcript backup reliability.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# session-continuity-ops

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Session Start Hydration](./session-start.md)
- [Session Stop Persistence](./session-stop.md)
- [Transcript Backup Controls](./transcript-backup.md)
