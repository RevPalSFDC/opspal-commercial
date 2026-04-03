---
name: timezone-safe-date-parsing
description: "When parsing YYYY-MM-DD for display purposes, always use new Date(year, month-1, day) instead of new Date(dateString) to avoid UTC-to-local timezone shift."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Timezone Safe Date Parsing

When parsing YYYY-MM-DD for display purposes, always use new Date(year, month-1, day) instead of new Date(dateString) to avoid UTC-to-local timezone shift.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When parsing YYYY-MM-DD for display purposes, always use new Date(year, month-1, day) instead of new Date(dateString) to avoid UTC-to-local timezone shift.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 736442a7-880c-4589-99e4-d5163b655b33
- **Agent**: manual debugging
- **Enriched**: 2026-04-03
