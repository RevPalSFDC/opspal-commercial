---
name: hubspot-portal-runtime-lifecycle
description: Manage portal auth/switch lifecycle hooks and stale credential recovery for stable HubSpot runtime context.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-portal-runtime-lifecycle

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Postauth Quirk Detection](./postauth-quirks.md)
- [Portal Switch Staleness Handling](./switch-staleness.md)
- [Portal Lifecycle Guardrails](./lifecycle-guardrails.md)
