---
name: openpyxl-template-format-inheritance-guard
description: "After copy_worksheet + value clearing, explicitly set number_format for every data column to prevent template formatting bleed-through"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct execution
---

# Openpyxl Template Format Inheritance Guard

After copy_worksheet + value clearing, explicitly set number_format for every data column to prevent template formatting bleed-through

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: After copy_worksheet + value clearing, explicitly set number_format for every data column to prevent template formatting bleed-through
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2777dcfa-5491-470b-a925-ad3b71f900d0
- **Agent**: direct execution
- **Enriched**: 2026-04-03
