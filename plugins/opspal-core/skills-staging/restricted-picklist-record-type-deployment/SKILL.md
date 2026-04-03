---
name: restricted-picklist-record-type-deployment
description: "When adding values to restricted picklist fields, always deploy record type XML updates alongside the field changes for [COMPANY] active record types on ALL objects that reference the field (including via GlobalValueSet)."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:general-purpose (smoke-tester)
---

# Restricted Picklist Record Type Deployment

When adding values to restricted picklist fields, always deploy record type XML updates alongside the field changes for [COMPANY] active record types on ALL objects that reference the field (including via GlobalValueSet).

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When adding values to restricted picklist fields, always deploy record type XML updates alongside the field changes for [COMPANY] active record types on ALL objects that reference the field (including via GlobalValueSet).
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2cd1fc6f-231e-42c1-aa05-1d0e5b666325
- **Agent**: general-purpose (smoke-tester)
- **Enriched**: 2026-04-03
