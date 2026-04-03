---
name: smart-merge-update-csv
description: "When updating partial fields, merge source data with current org values to preserve existing data in non-updated fields"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Smart Merge Update Csv

When updating partial fields, merge source data with current org values to preserve existing data in non-updated fields

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When updating partial fields, merge source data with current org values to preserve existing data in non-updated fields
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 133709dc-743d-48f0-931f-9a7350587e2d
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
