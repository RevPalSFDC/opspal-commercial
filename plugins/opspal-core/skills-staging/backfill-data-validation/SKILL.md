---
name: backfill-data-validation
description: "Export pre-backfill snapshots, execute backfill, export post-backfill data, run automated comparison to verify no pre-existing values were overwritten"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Backfill Data Validation

Export pre-backfill snapshots, execute backfill, export post-backfill data, run automated comparison to verify no pre-existing values were overwritten

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Export pre-backfill snapshots, execute backfill, export post-backfill data, run automated comparison to verify no pre-existing values were overwritten
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ed59e380-1ac6-4b26-9013-4588ccc0f170
- **Agent**: manual (main agent)
- **Enriched**: 2026-04-03
