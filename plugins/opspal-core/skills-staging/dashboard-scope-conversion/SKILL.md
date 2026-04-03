---
name: dashboard-scope-conversion
description: "Converting user-scoped dashboards/reports to management (all-records) scope by cloning and modifying owner filters"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-reports-dashboards
---

# Dashboard Scope Conversion

Converting user-scoped dashboards/reports to management (all-records) scope by cloning and modifying owner filters

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Converting user-scoped dashboards/reports to management (all-records) scope by cloning and modifying owner filters
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 777671d4-571f-468b-9caf-dda60940592b
- **Agent**: sfdc-reports-dashboards
- **Enriched**: 2026-04-03
