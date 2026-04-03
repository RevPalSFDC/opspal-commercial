---
name: dependent-picklist-pre-flight-check
description: "Before updating any picklist field, query field describe to check for controlling fields and ensure controlling value is set appropriately"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Dependent Picklist Pre Flight Check

Before updating any picklist field, query field describe to check for controlling fields and ensure controlling value is set appropriately

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before updating any picklist field, query field describe to check for controlling fields and ensure controlling value is set appropriately
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a817c7ab-108d-438c-b782-cb4173b88081
- **Agent**: manual discovery during [SFDC_ID]
- **Enriched**: 2026-04-03
