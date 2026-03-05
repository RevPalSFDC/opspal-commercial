---
name: hubspot-cms-release-operations
description: Operate hook workflows for HubSpot CMS release readiness, publish controls, and post-publish telemetry/notifications.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-cms-release-operations

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Prepublish Validation Gates](./prepublish-gates.md)
- [Postpublish Notification and History](./postpublish-notify.md)
- [Release Force/Bypass Policy](./release-policy.md)
