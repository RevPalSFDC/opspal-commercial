---
name: salesforce-task-risk-routing-framework
description: Salesforce task risk-routing framework for mandatory agent selection on high-risk operations, advisory routing for medium risk, and enforcement hooks for task safety.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Task Risk Routing Framework

Use this skill for task hook logic that routes work by risk level.

## Workflow

1. Classify incoming task risk.
2. Enforce mandatory agent use for high-risk categories.
3. Provide advisory routing for medium-risk operations.
4. Record routing outcomes for governance analysis.

## Routing Boundaries

Use this skill for hook-level risk routing.
Use `salesforce-hook-governance-framework` for broader policy and approval controls.

## References

- [mandatory high-risk routing](./mandatory-highrisk-routing.md)
- [advisory routing suggestions](./advisory-routing-suggestions.md)
- [agent usage validation](./agent-usage-validation.md)
