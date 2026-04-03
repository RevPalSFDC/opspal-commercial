---
name: bulk-opportunity-ownership-reassignment
description: "Query source users → query open opps → present for review → CSV bulk update → verify zero remaining"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-execution
---

# Bulk Opportunity Ownership Reassignment

Query source users → query open opps → present for review → CSV bulk update → verify zero remaining

## When to Use This Skill

- During data import or bulk operations

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query source users → query open opps → present for review → CSV bulk update → verify zero remaining
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6002d3fa-43ff-4826-871d-dd19246fcdf6
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
