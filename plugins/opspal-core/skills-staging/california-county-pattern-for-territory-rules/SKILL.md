---
name: california-county-pattern-for-territory-rules
description: "When creating territory assignment rules with county criteria: 1) Use county name without 'County' suffix (e.g., 'Nassau' not 'Nassau County'), 2) Use OR logic between multiple counties, 3) Use 'contains' operation for flexibility"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# California County Pattern For Territory Rules

When creating territory assignment rules with county criteria: 1) Use county name without 'County' suffix (e.g., 'Nassau' not 'Nassau County'), 2) Use OR logic between multiple counties, 3) Use 'contains' operation for flexibility

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When creating territory assignment rules with county criteria: 1) Use county name without 'County' suffix (e
2. , 'Nassau' not 'Nassau County'), 2) Use OR logic between multiple counties, 3) Use 'contains' operation for flexibility

## Source

- **Reflection**: 77cde7d3-cdfd-4718-a6f4-3bce9ebc1505
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
