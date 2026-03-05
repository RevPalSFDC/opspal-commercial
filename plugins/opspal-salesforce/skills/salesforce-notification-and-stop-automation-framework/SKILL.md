---
name: salesforce-notification-and-stop-automation-framework
description: Salesforce notification and stop-hook automation framework for matcher-based notifications and prompt-based stop triggers for quality and release coordination workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Notification and Stop Automation Framework

Use this skill for actionable notification/stop automations in hook system.

## Workflow

1. Define trigger matcher/evaluation criteria.
2. Configure action payloads (suggestions/commands/agents).
3. Validate non-blocking behavior and signal quality.
4. Tune triggers to minimize noise and false positives.

## Routing Boundaries

Use this skill for notification and stop-hook automation logic.
Use `salesforce-task-risk-routing-framework` for task-entry risk gating.

## References

- [deployment notification matchers](./deployment-notification-matchers.md)
- [quality stop trigger](./quality-stop-trigger.md)
- [release stop trigger](./release-stop-trigger.md)
