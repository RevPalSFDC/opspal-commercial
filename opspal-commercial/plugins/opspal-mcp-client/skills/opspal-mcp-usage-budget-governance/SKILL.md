---
name: opspal-mcp-usage-budget-governance
description: Track and govern daily OpsPal MCP usage budgets using post-tool hooks and threshold-based warnings.
allowed-tools: Read, Grep, Glob
---

# opspal-mcp-usage-budget-governance

Use this skill when working on hook-driven workflows in this domain.

## Workflow

1. Identify the hook trigger surface and decision points.
2. Validate policy or guardrail behavior before and after change.
3. Capture failure modes, rollback path, and verification checks.

## Routing Boundaries

Use this skill for the specific hook workflow described here.
Defer to adjacent domain skills when the task is primarily about business logic rather than hook enforcement.

## References

- [Daily Budget Accounting](./daily-budget.md)
- [Tier-Aware Limit Policy](./tier-limits.md)
- [Threshold Warning Strategy](./threshold-alerting.md)
