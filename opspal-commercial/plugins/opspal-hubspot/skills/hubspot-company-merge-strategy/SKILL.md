---
name: hubspot-company-merge-strategy
description: Use hook guidance to choose safe merge strategies for HubSpot companies with Salesforce sync constraints.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-company-merge-strategy

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Premerge Blocker Checks](./premerge-checks.md)
- [Merge Strategy Routing](./strategy-routing.md)
- [Postmerge Verification Signals](./postmerge-verification.md)
