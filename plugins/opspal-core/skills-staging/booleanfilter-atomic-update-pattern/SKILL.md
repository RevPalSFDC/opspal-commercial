---
name: booleanfilter-atomic-update-pattern
description: "Clear filter -> Add item -> VERIFY null -> Set new filter -> VERIFY correct"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Booleanfilter Atomic Update Pattern

Clear filter -> Add item -> VERIFY null -> Set new filter -> VERIFY correct

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Clear filter -> Add item -> VERIFY null -> Set new filter -> VERIFY correct
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f9588694-b8d6-4223-83e8-1fec54683e95
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
