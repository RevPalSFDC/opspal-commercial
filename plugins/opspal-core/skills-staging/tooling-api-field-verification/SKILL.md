---
name: tooling-api-field-verification
description: "Use CustomField + EntityDefinition queries instead of sf sobject describe to bypass FLS limitations. Two-step for custom objects: EntityDefinition.DurableId lookup → CustomField query."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Tooling Api Field Verification

Use CustomField + EntityDefinition queries instead of sf sobject describe to bypass FLS limitations. Two-step for custom objects: EntityDefinition.DurableId lookup → CustomField query.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Use CustomField + EntityDefinition queries instead of sf sobject describe to bypass FLS limitations
2. Two-step for custom objects: EntityDefinition
3. DurableId lookup → CustomField query

## Source

- **Reflection**: 9d642c3c-d9ab-4628-bed9-93db7c5c4ddb
- **Agent**: direct execution
- **Enriched**: 2026-04-03
