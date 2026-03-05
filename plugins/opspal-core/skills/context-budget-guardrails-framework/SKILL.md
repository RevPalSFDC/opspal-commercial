---
name: context-budget-guardrails-framework
description: Implement hook-level context budget controls to prevent quality degradation at high token utilization.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# context-budget-guardrails-framework

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Context Budget Thresholds](./budget-thresholds.md)
- [Mitigation Prompting](./mitigation-prompts.md)
- [Fallback Behavior](./safety-fallbacks.md)
