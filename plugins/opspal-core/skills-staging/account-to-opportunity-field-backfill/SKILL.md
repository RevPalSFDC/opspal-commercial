---
name: account-to-opportunity-field-backfill
description: "Query parent Account fields via relationship SOQL, generate CSV mapping, and bulk update child Opportunity records to populate fields that should have been auto-synced"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Account To Opportunity Field Backfill

Query parent Account fields via relationship SOQL, generate CSV mapping, and bulk update child Opportunity records to populate fields that should have been auto-synced

## When to Use This Skill

- During data import or bulk operations

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query parent Account fields via relationship SOQL, generate CSV mapping, and bulk update child Opportunity records to populate fields that should have been auto-synced
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e47f886f-cda7-412d-97e6-6413489b3721
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
