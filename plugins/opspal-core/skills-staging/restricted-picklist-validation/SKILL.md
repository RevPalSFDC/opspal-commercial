---
name: restricted-picklist-validation
description: "Compare source system picklist values against SF restricted picklist to identify character-level mismatches"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:sf-field-describe
---

# Restricted Picklist Validation

Compare source system picklist values against SF restricted picklist to identify character-level mismatches

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Compare source system picklist values against SF restricted picklist to identify character-level mismatches
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: fc987ddf-9cbe-4c09-8823-8937f54ebc91
- **Agent**: sf-field-describe
- **Enriched**: 2026-04-03
