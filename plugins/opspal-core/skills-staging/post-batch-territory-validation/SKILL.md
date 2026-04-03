---
name: post-batch-territory-validation
description: "After running PrimaryTerritorySyncBatch, query for orphaned accounts (territory assignment but null Primary Territory) and generate fix file"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Post Batch Territory Validation

After running PrimaryTerritorySyncBatch, query for orphaned accounts (territory assignment but null Primary Territory) and generate fix file

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: After running PrimaryTerritorySyncBatch, query for orphaned accounts (territory assignment but null Primary Territory) and generate fix file
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a52c7d0e-a6c3-4881-804b-74255cce86c8
- **Agent**: manual execution
- **Enriched**: 2026-04-03
