---
name: salesforce-runtime-telemetry-and-api-quota-framework
description: Operate telemetry and API quota tracking hooks for Salesforce command workflows and alert thresholds.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# salesforce-runtime-telemetry-and-api-quota-framework

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [SF Command Telemetry](./sf-command-telemetry.md)
- [Operation Observation Signals](./operation-observe.md)
- [Quota and Budget Alerting](./quota-alerting.md)
