---
name: flow-field-assignment-selective-removal
description: "Identify inputAssignments in recordUpdates, remove targeted blocks, clean up orphaned formulas, verify with test record"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct execution (no specialized agent used)
---

# Flow Field Assignment Selective Removal

Identify inputAssignments in recordUpdates, remove targeted blocks, clean up orphaned formulas, verify with test record

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Identify inputAssignments in recordUpdates, remove targeted blocks, clean up orphaned formulas, verify with test record
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c4149ad7-cb1e-4702-b8b2-de4f7887a0b5
- **Agent**: direct execution (no specialized agent used)
- **Enriched**: 2026-04-03
