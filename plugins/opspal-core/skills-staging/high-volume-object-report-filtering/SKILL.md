---
name: high-volume-object-report-filtering
description: "For custom objects with >[N] rows, always add restrictive WHERE filters before using in dashboard reports to avoid error 303 timeouts"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-reports-dashboards
---

# High Volume Object Report Filtering

For custom objects with >[N] rows, always add restrictive WHERE filters before using in dashboard reports to avoid error 303 timeouts

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern
- When building or modifying reports and dashboards

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: For custom objects with >[N] rows, always add restrictive WHERE filters before using in dashboard reports to avoid error 303 timeouts
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 25e782be-c024-46be-8213-677377ccedf6
- **Agent**: opspal-salesforce:sfdc-reports-dashboards
- **Enriched**: 2026-04-03
