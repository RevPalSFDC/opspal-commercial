---
name: territory-ownership-cleanup
description: "Query accounts by territory, identify admin-owned records, map to correct RSM/AE, bulk reassign with backup"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Territory Ownership Cleanup

Query accounts by territory, identify admin-owned records, map to correct RSM/AE, bulk reassign with backup

## When to Use This Skill

- During data import or bulk operations

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query accounts by territory, identify admin-owned records, map to correct RSM/AE, bulk reassign with backup
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 7a20a95c-0975-4f4e-91f1-f5b4c47b33f0
- **Agent**: manual
- **Enriched**: 2026-04-03
