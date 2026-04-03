---
name: openpyxlsheet-regeneration-with-merged-cells
description: "When regenerating Excel sheets containing merged cells, use delete+recreate pattern (del wb[sheet_name]; wb.create_sheet(sheet_name)) instead of cell-by-cell clearing to avoid 'MergedCell object attribute value is read-only' errors."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:direct-implementation
---

# Openpyxlsheet Regeneration With Merged Cells

When regenerating Excel sheets containing merged cells, use delete+recreate pattern (del wb[sheet_name]; wb.create_sheet(sheet_name)) instead of cell-by-cell clearing to avoid 'MergedCell object attribute value is read-only' errors.

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When regenerating Excel sheets containing merged cells, use delete+recreate pattern (del wb[sheet_name]
2. create_sheet(sheet_name)) instead of cell-by-cell clearing to avoid 'MergedCell object attribute value is read-only' errors

## Source

- **Reflection**: 83b084ca-f9a8-4453-8e3a-a42d2c616cb3
- **Agent**: direct-implementation
- **Enriched**: 2026-04-03
