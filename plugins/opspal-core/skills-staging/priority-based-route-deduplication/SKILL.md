---
name: priority-based-route-deduplication
description: "When multiple plugins provide same agent, prefer opspal-* prefixed plugins over legacy *-plugin names"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Priority Based Route Deduplication

When multiple plugins provide same agent, prefer opspal-* prefixed plugins over legacy *-plugin names

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: plugin-validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When multiple plugins provide same agent, prefer opspal-* prefixed plugins over legacy *-plugin names
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 43553d24-8424-494e-aae6-3b25749ff653
- **Agent**: unknown
- **Enriched**: 2026-04-03
