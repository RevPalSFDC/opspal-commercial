---
name: batch-soql-excel-enrichment
description: "Read Excel IDs -> batch SOQL query with [COMPANY] IN (200 max) -> map results -> openpyxl cell-by-cell write preserving formatting -> save to new file"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Batch Soql Excel Enrichment

Read Excel IDs -> batch SOQL query with [COMPANY] IN (200 max) -> map results -> openpyxl cell-by-cell write preserving formatting -> save to new file

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Read Excel IDs -> batch SOQL query with [COMPANY] IN (200 max) -> map results -> openpyxl cell-by-cell write preserving formatting -> save to new file
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f3df0a29-5dd0-483f-b647-49b63a668c77
- **Agent**: manual (Python script)
- **Enriched**: 2026-04-03
