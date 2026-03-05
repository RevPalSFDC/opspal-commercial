---
name: salesforce-permission-propagation-and-field-readiness-framework
description: Manage hook workflows for permission sync and post-field-deployment readiness validation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# salesforce-permission-propagation-and-field-readiness-framework

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Predeploy Permission Sync](./predeploy-perm-sync.md)
- [Post-Field Deployment Readiness](./field-readiness.md)
- [Propagation Retry Patterns](./propagation-retries.md)
