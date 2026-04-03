---
name: analytics-api-report-scope-discovery
description: "Query [SFDC_ID].scopeInfo to discover valid scope values before creating/updating reports via Analytics API. Different report types use different scope keywords (org vs organization)."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct
---

# Analytics Api Report Scope Discovery

Query [SFDC_ID].scopeInfo to discover valid scope values before creating/updating reports via Analytics API. Different report types use different scope keywords (org vs organization).

## When to Use This Skill

- Before executing the operation described in this skill
- When building or modifying reports and dashboards

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Query [SFDC_ID]
2. scopeInfo to discover valid scope values before creating/updating reports via Analytics API
3. Different report types use different scope keywords (org vs organization)

## Source

- **Reflection**: c1a3ea80-fe4c-442c-aed0-a5833425a5d3
- **Agent**: direct
- **Enriched**: 2026-04-03
