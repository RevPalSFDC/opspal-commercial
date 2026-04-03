---
name: full-picture-backfill-csv
description: "Generate backfill review CSVs with [COMPANY]_Field and Backfill_Field columns side-by-side so reviewer can see what's already populated vs what's being filled in"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution after user clarification
---

# Full Picture Backfill Csv

Generate backfill review CSVs with [COMPANY]_Field and Backfill_Field columns side-by-side so reviewer can see what's already populated vs what's being filled in

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Generate backfill review CSVs with [COMPANY]_Field and Backfill_Field columns side-by-side so reviewer can see what's already populated vs what's being filled in
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 167680ab-dd0f-4c49-b0ce-9640d64596cc
- **Agent**: direct execution after user clarification
- **Enriched**: 2026-04-03
