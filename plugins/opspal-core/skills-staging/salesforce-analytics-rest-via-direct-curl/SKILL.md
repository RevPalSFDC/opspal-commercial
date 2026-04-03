---
name: salesforce-analytics-rest-via-direct-curl
description: "sf cli api request returns HTML redirects for [COMPANY] endpoints. Use direct curl with [COMPANY] [TOKEN] to /services/data/v60.0/analytics/reports/{id}/describe instead."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:direct-execution
---

# Salesforce Analytics Rest Via Direct Curl

sf cli api request returns HTML redirects for [COMPANY] endpoints. Use direct curl with [COMPANY] [TOKEN] to /services/data/v60.0/analytics/reports/{id}/describe instead.

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. sf cli api request returns HTML redirects for [COMPANY] endpoints
2. Use direct curl with [COMPANY] [TOKEN] to /services/data/v60
3. 0/analytics/reports/{id}/describe instead

## Source

- **Reflection**: b9e041c7-317e-48da-9419-d0ccf1431892
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
