---
name: asana-historical-task-backfill
description: "Create tasks with completed=true, due_on=historical_date, proper section membership, and assignee in single API call"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:direct-execution
---

# Asana Historical Task Backfill

Create tasks with completed=true, due_on=historical_date, proper section membership, and assignee in single API call

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Create tasks with completed=true, due_on=historical_date, proper section membership, and assignee in single API call
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4cb3a62b-139b-4e24-950f-158352ee782c
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
