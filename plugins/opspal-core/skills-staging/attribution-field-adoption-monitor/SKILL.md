---
name: attribution-field-adoption-monitor
description: "Query COUNT() of attribution lookup fields across Lead/Contact/Opportunity to assess post-deployment adoption rates. Compare populated vs total records and check for recent activity timestamps."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-query-specialist
---

# Attribution Field Adoption Monitor

Query COUNT() of attribution lookup fields across Lead/Contact/Opportunity to assess post-deployment adoption rates. Compare populated vs total records and check for recent activity timestamps.

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Query COUNT() of attribution lookup fields across Lead/Contact/Opportunity to assess post-deployment adoption rates
2. Compare populated vs total records and check for recent activity timestamps

## Source

- **Reflection**: bcbb31a3-3096-4933-9f67-017b44a955c9
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
