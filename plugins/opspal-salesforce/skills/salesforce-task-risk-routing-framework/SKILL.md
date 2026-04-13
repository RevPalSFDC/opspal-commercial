---
name: salesforce-task-risk-routing-framework
description: Salesforce task risk-routing framework for mandatory agent selection on high-risk operations, advisory routing for medium risk, and enforcement hooks for task safety.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Task Risk Routing Framework

## When to Use This Skill

Use this skill when:
- Implementing the routing hook that classifies task risk and enforces agent selection
- Defining which operations require mandatory specialist agents
- Setting advisory routing thresholds for medium-complexity tasks
- Validating that the correct agent was used for a given operation

**Not for**: Broader governance policy (use `salesforce-hook-governance-framework`), circuit breaker patterns (use `salesforce-hook-reliability-circuit-breaker-framework`), or notification/stop triggers (use `salesforce-notification-and-stop-automation-framework`).

## Risk Classification

| Risk Tier | Complexity Score | Routing Behavior | Examples |
|-----------|-----------------|-------------------|----------|
| **Low** | <0.5 | No routing needed | Read queries, metadata inspection |
| **Medium** | 0.5-0.7 | Advisory: suggest specialist agent | Sandbox deploys, single-object updates |
| **High** | >=0.7 | **Mandatory**: must use Task tool with specialist | Production deploys, bulk operations, permission changes |
| **Critical** | >=0.9 | Blocking: require orchestrator | Cross-platform workflows, destructive operations |

## Mandatory Agent Routing Map

| Operation Category | Required Agent |
|-------------------|----------------|
| CPQ/Q2C assessment | `sfdc-cpq-assessor` |
| RevOps audit | `sfdc-revops-auditor` |
| Automation audit | `sfdc-automation-auditor` |
| Permission set creation | `sfdc-permission-orchestrator` |
| Reports/dashboards | `sfdc-reports-dashboards` |
| Production deployment | `sfdc-deployment-manager` |
| Territory operations | `sfdc-territory-orchestrator` |
| Data import/export | `sfdc-data-operations` |

## Workflow

1. Extract task description and tool call context from hook input
2. Score complexity using the routing rubric
3. Apply routing behavior per risk tier (advisory vs mandatory)
4. Log routing decision to `~/.claude/logs/routing.jsonl`

## Routing Boundaries

Use this skill for hook-level risk routing.
Use `salesforce-hook-governance-framework` for broader policy and approval controls.

## References

- [mandatory high-risk routing](./mandatory-highrisk-routing.md)
- [advisory routing suggestions](./advisory-routing-suggestions.md)
- [agent usage validation](./agent-usage-validation.md)
