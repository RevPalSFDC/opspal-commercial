---
name: excel-generator-column-layout-migration
description: "When shifting column layouts in openpyxl generators, systematically update: (1) column header definitions, (2) AM row data writers, (3) team subtotal formula generators, (4) metrics extraction readers, (5) main() call site wiring. Use a column mapping table to track old→new letter assignments."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct
---

# Excel Generator Column Layout Migration

When shifting column layouts in openpyxl generators, systematically update: (1) column header definitions, (2) AM row data writers, (3) team subtotal formula generators, (4) metrics extraction readers, (5) main() call site wiring. Use a column mapping table to track old→new letter assignments.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When shifting column layouts in openpyxl generators, systematically update: (1) column header definitions, (2) AM row data writers, (3) team subtotal formula generators, (4) metrics extraction readers, (5) main() call site wiring
2. Use a column mapping table to track old→new letter assignments

## Source

- **Reflection**: f6d8b239-34c2-4ae9-a149-b10e5018bedc
- **Agent**: direct
- **Enriched**: 2026-04-03
