---
name: picklist-value-validation
description: "Query sf sobject describe to validate user-provided picklist values before creating metadata that references them"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Picklist Value Validation

Query sf sobject describe to validate user-provided picklist values before creating metadata that references them

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query sf sobject describe to validate user-provided picklist values before creating metadata that references them
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 3dce9cc3-50cf-41b7-ae58-bfe1534c0d90
- **Agent**: direct execution
- **Enriched**: 2026-04-03
