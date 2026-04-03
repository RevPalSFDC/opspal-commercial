---
name: picklist-field-batch-update-with-formula-verification
description: "Query target records -> validate current state -> update picklist field -> verify downstream formula field auto-populated"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct CLI execution
---

# Picklist Field Batch Update With Formula Verification

Query target records -> validate current state -> update picklist field -> verify downstream formula field auto-populated

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query target records -> validate current state -> update picklist field -> verify downstream formula field auto-populated
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 63efccc6-b38d-47d0-a089-53834de9926a
- **Agent**: direct CLI execution
- **Enriched**: 2026-04-03
