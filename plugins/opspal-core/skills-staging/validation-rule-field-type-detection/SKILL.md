---
name: validation-rule-field-type-detection
description: "Iteratively test formula field types via dry-run deployment to detect multiselect (no TEXT), regular picklist (needs TEXT), and text fields (no TEXT wrapper)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Validation Rule Field Type Detection

Iteratively test formula field types via dry-run deployment to detect multiselect (no TEXT), regular picklist (needs TEXT), and text fields (no TEXT wrapper)

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Iteratively test formula field types via dry-run deployment to detect multiselect (no TEXT), regular picklist (needs TEXT), and text fields (no TEXT wrapper)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: cb026fef-2b2c-4d57-b64d-64f6dc2fa578
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
