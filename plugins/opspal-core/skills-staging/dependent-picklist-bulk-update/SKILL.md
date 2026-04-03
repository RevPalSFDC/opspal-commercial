---
name: dependent-picklist-bulk-update
description: "When updating dependent picklists (Market -> Segment2 -> Sub_Segment), include controlling field in same Composite API PATCH body to satisfy validation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Dependent Picklist Bulk Update

When updating dependent picklists (Market -> Segment2 -> Sub_Segment), include controlling field in same Composite API PATCH body to satisfy validation

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When updating dependent picklists (Market -> Segment2 -> Sub_Segment), include controlling field in same Composite API PATCH body to satisfy validation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c5bf2354-6ce4-4afb-8d64-5e41e2651e2a
- **Agent**: direct execution
- **Enriched**: 2026-04-03
