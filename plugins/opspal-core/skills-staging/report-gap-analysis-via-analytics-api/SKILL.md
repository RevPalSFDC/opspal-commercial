---
name: report-gap-analysis-via-analytics-api
description: "Use /analytics/reports/{id}/describe to extract report groupings and filters, then query for null values in grouping fields to quantify coverage gaps"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Report Gap Analysis Via Analytics Api

Use /analytics/reports/{id}/describe to extract report groupings and filters, then query for null values in grouping fields to quantify coverage gaps

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use /analytics/reports/{id}/describe to extract report groupings and filters, then query for null values in grouping fields to quantify coverage gaps
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6da61b6f-d0ab-4ed4-9822-7e4c45741c32
- **Agent**: direct execution
- **Enriched**: 2026-04-03
