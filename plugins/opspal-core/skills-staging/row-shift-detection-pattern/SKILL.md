---
name: row-shift-detection-pattern
description: "When bulk update errors occur, query AccountHistory for the error window, sort by timestamp, and look for pattern where OldValue of record N equals expected NewValue of record N-1 (indicating index shift)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Row Shift Detection Pattern

When bulk update errors occur, query AccountHistory for the error window, sort by timestamp, and look for pattern where OldValue of record N equals expected NewValue of record N-1 (indicating index shift)

## When to Use This Skill

- During data import or bulk operations
- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When bulk update errors occur, query AccountHistory for the error window, sort by timestamp, and look for pattern where OldValue of record N equals expected NewValue of record N-1 (indicating index shift)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 97da66df-b184-4907-9c10-d3cd907b6d13
- **Agent**: manual-investigation
- **Enriched**: 2026-04-03
