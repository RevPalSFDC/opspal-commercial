---
name: asana-board-reconciliation-before-batch-create
description: "Before creating tasks from a plan, fetch all existing project tasks, fuzzy-match names, and update existing rather than creating duplicates"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Asana Board Reconciliation Before Batch Create

Before creating tasks from a plan, fetch all existing project tasks, fuzzy-match names, and update existing rather than creating duplicates

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before creating tasks from a plan, fetch all existing project tasks, fuzzy-match names, and update existing rather than creating duplicates
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: bc233c54-d650-44a3-9fbd-4c6cb17ceb9f
- **Agent**: manual correction after opspal-core:asana-task-manager
- **Enriched**: 2026-04-03
