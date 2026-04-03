---
name: multi-period-sales-analytics-extraction
description: "Extract sales data across multiple time periods (YTD, prior year, 2H prior year) with consistent field mapping for trend analysis"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-query-specialist
---

# Multi Period Sales Analytics Extraction

Extract sales data across multiple time periods (YTD, prior year, 2H prior year) with consistent field mapping for trend analysis

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Extract sales data across multiple time periods (YTD, prior year, 2H prior year) with consistent field mapping for trend analysis
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f245ed41-ea8d-4e41-ad8a-7c9fbf30bf4b
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
