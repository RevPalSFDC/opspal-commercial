---
name: territory-rule-item-cleanup-sequence
description: "When consolidating rule items: 1) Update boolean filter to not reference items to delete, 2) Delete unused items, 3) Verify final filter. Cannot delete items still referenced in filter."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory Rule Item Cleanup Sequence

When consolidating rule items: 1) Update boolean filter to not reference items to delete, 2) Delete unused items, 3) Verify final filter. Cannot delete items still referenced in filter.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When consolidating rule items: 1) Update boolean filter to not reference items to delete, 2) Delete unused items, 3) Verify final filter
2. Cannot delete items still referenced in filter

## Source

- **Reflection**: 76490d6e-0ebc-4560-abe7-9d962139b31c
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
