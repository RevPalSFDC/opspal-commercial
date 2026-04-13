---
name: salesforce-notification-and-stop-automation-framework
description: Salesforce notification and stop-hook automation framework for matcher-based notifications and prompt-based stop triggers for quality and release coordination workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Notification and Stop Automation Framework

## When to Use This Skill

Use this skill when:
- Building hooks that surface contextual notifications during Salesforce operations
- Implementing "stop" triggers that halt automation pipelines safely
- Configuring kill switches via Custom Metadata or environment variables
- Setting up deployment-context notifications (e.g., "you are targeting production")
- Designing quality gates that pause rather than block

**Not for**: Risk-based routing (use `salesforce-task-risk-routing-framework`), hook governance (use `salesforce-hook-governance-framework`), or circuit breaker reliability (use `salesforce-hook-reliability-circuit-breaker-framework`).

## Notification Types

| Type | Trigger | Behavior | Example |
|------|---------|----------|---------|
| **Advisory** | Pattern match on tool args | Display message, continue | "Targeting production org" |
| **Suggestion** | Context detection | Surface recommended command/agent | "Consider running /checkdependencies first" |
| **Quality Stop** | Validation failure | Pause pipeline, require ack | "Test coverage below 75%, confirm to proceed" |
| **Release Stop** | Freeze window detection | Block until window closes | "Merge freeze active until 2026-04-15" |

## Kill Switch Patterns

```bash
# Environment variable kill switch (fastest to toggle)
if [ "${SKIP_DEPLOY_HOOKS:-0}" = "1" ]; then
  exit 0  # Bypass all deployment notifications
fi

# File-based kill switch (persistent across sessions)
KILL_SWITCH="${HOME}/.claude/kill-switches/deploy-freeze.flag"
if [ -f "$KILL_SWITCH" ]; then
  echo '{"decision":"deny","reason":"Deploy freeze active. Remove ~/.claude/kill-switches/deploy-freeze.flag to resume."}'
  exit 1
fi
```

## Workflow

1. Define trigger matchers: regex on tool name, argument patterns, org context
2. Configure notification payload: message text, suggested action, severity
3. Ensure notifications are non-blocking (exit 0) unless explicitly a stop trigger
4. Monitor notification-to-action ratio to reduce alert fatigue

## Routing Boundaries

Use this skill for notification and stop-hook automation logic.
Use `salesforce-task-risk-routing-framework` for task-entry risk gating.

## References

- [deployment notification matchers](./deployment-notification-matchers.md)
- [quality stop trigger](./quality-stop-trigger.md)
- [release stop trigger](./release-stop-trigger.md)
