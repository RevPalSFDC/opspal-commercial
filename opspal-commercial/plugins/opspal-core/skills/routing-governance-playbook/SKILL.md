---
name: routing-governance-playbook
description: Configure and tune hook-based routing governance, complexity thresholds, block modes, and override policies across core prompt/task hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# routing-governance-playbook

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Routing Policy Tuning](./routing-policy.md)
- [Complexity Threshold Governance](./complexity-thresholds.md)
- [Override and Exception Controls](./override-controls.md)
