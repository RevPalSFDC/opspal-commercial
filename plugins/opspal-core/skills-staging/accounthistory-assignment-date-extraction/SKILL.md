---
name: accounthistory-assignment-date-extraction
description: "Use AccountHistory with Field='Owner' filter to track ownership changes over time. Batch queries in groups of 200 records to handle large volumes. Implement most-recent-change logic by sorting CreatedDate DESC and matching NewValue to current owner. Fallback to Account.CreatedDate when no history exists. Calculate tenure using datetime delta from assignment date to current date."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-implementation
---

# Accounthistory Assignment Date Extraction

Use AccountHistory with Field='Owner' filter to track ownership changes over time. Batch queries in groups of 200 records to handle large volumes. Implement most-recent-change logic by sorting CreatedDate DESC and matching NewValue to current owner. Fallback to Account.CreatedDate when no history exists. Calculate tenure using datetime delta from assignment date to current date.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Use AccountHistory with Field='Owner' filter to track ownership changes over time
2. Batch queries in groups of 200 records to handle large volumes
3. Implement most-recent-change logic by sorting CreatedDate DESC and matching NewValue to current owner
4. Fallback to Account
5. CreatedDate when no history exists
6. Calculate tenure using datetime delta from assignment date to current date

## Source

- **Reflection**: b3916d6e-3bf3-480a-ac8c-b9ccbd4d44f2
- **Agent**: direct-implementation
- **Enriched**: 2026-04-03
