---
name: business-friendly-date-formatting-for-csv-exports
description: "Convert ISO 8601 datetime strings (with timezone) to simple YYYY-MM-DD format using strftime('%Y-%m-%d') for business reports. Apply consistently across all date fields (assignment dates, created dates, modified dates). Improves readability for Excel users and eliminates timezone confusion in reporting contexts."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-implementation
---

# Business Friendly Date Formatting For Csv Exports

Convert ISO 8601 datetime strings (with timezone) to simple YYYY-MM-DD format using strftime('%Y-%m-%d') for business reports. Apply consistently across all date fields (assignment dates, created dates, modified dates). Improves readability for Excel users and eliminates timezone confusion in reporting contexts.

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Convert ISO 8601 datetime strings (with timezone) to simple YYYY-MM-DD format using strftime('%Y-%m-%d') for business reports
2. Apply consistently across all date fields (assignment dates, created dates, modified dates)
3. Improves readability for Excel users and eliminates timezone confusion in reporting contexts

## Source

- **Reflection**: b3916d6e-3bf3-480a-ac8c-b9ccbd4d44f2
- **Agent**: direct-implementation
- **Enriched**: 2026-04-03
