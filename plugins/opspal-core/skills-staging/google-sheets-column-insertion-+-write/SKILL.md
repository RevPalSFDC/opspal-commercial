---
name: google-sheets-column-insertion-+-write
description: "Use batchUpdate [SFDC_ID] to add columns, then values update to populate. Preserves existing data by shifting columns right."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct
---

# Google Sheets Column Insertion + Write

Use batchUpdate [SFDC_ID] to add columns, then values update to populate. Preserves existing data by shifting columns right.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Use batchUpdate [SFDC_ID] to add columns, then values update to populate
2. Preserves existing data by shifting columns right

## Source

- **Reflection**: a8170299-41bb-4781-af64-b369398c51bb
- **Agent**: direct
- **Enriched**: 2026-04-03
