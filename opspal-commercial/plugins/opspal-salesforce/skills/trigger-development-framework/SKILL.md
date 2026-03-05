---
name: trigger-development-framework
description: Salesforce Apex trigger development lifecycle for design, handler architecture, bulkification, testing, deployment, and troubleshooting. Use when building or modifying triggers beyond basic references, especially for production-safe rollout.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Trigger Development Framework

Use this skill for end-to-end Apex trigger work.

## Workflow

1. Define trigger event model and execution constraints.
2. Design handler separation and recursion controls.
3. Implement bulk-safe query and DML patterns.
4. Build focused tests for positive, negative, and bulk scenarios.
5. Validate deployment readiness and post-deploy monitoring.

## Routing Boundaries

Use this skill when trigger architecture, rollout safety, or troubleshooting is required.
Do not use this skill for declarative validation-only work; use `validation-rule-patterns`.
Do not use this skill for Flow-only implementation; use `flow-segmentation-guide` or flow lifecycle skill.

## References

- [fundamentals](./fundamentals.md)
- [handler architecture](./handler-architecture.md)
- [bulkification and testing](./bulkification-testing.md)
- [deployment and troubleshooting](./deployment-troubleshooting.md)
