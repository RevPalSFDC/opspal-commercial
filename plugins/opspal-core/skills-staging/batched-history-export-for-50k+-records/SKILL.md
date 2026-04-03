---
name: batched-history-export-for-50k+-records
description: "When AccountHistory exceeds [N] records, batch by date ranges using GROUP BY CALENDAR_YEAR/CALENDAR_MONTH to plan splits under 50K each."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Batched History Export For 50k+ Records

When AccountHistory exceeds [N] records, batch by date ranges using GROUP BY CALENDAR_YEAR/CALENDAR_MONTH to plan splits under 50K each.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When AccountHistory exceeds [N] records, batch by date ranges using GROUP BY CALENDAR_YEAR/CALENDAR_MONTH to plan splits under 50K each.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: b7cc6fb3-ce84-46ad-94a7-98519b3e75c6
- **Agent**: manual
- **Enriched**: 2026-04-03
