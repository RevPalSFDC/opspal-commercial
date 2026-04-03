---
name: campaign-window-vs-outcome-window-disambiguation
description: "When backfilling campaign influence, explicitly separate 'when campaigns ran' from 'when opportunities closed' - they are different windows"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Campaign Window Vs Outcome Window Disambiguation

When backfilling campaign influence, explicitly separate 'when campaigns ran' from 'when opportunities closed' - they are different windows

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When backfilling campaign influence, explicitly separate 'when campaigns ran' from 'when opportunities closed' - they are different windows
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 82e0e62c-d7c3-4aa8-bfbb-b13e8727ffe0
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
