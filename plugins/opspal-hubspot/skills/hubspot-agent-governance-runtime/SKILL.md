---
name: hubspot-agent-governance-runtime
description: Implement runtime hook governance for HubSpot task safety, mandatory agent routing, and strict-mode behavior.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-agent-governance-runtime

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Task Safety Gating](./task-gating.md)
- [Agent Validation Logic](./agent-validation.md)
- [Strict Mode and Bypass Policy](./strict-mode.md)
