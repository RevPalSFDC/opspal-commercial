---
name: salesforce-assessment-to-execution-automation-framework
description: Automate post-assessment hook workflows from assessment completion to planning triggers and knowledge sync.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# salesforce-assessment-to-execution-automation-framework

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Assessment Planning Trigger](./planning-trigger.md)
- [Assessment Notebook Sync](./notebook-sync.md)
- [Assessment-to-Execution Handshake](./execution-handshake.md)
