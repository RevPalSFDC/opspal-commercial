---
name: campaign-member-mql-deduplication
description: "When MQL timestamp is a formula field referencing Lead/Contact, deduplicate Campaign Members to prospect-level before analysis to remove ~50% noise"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Campaign Member Mql Deduplication

When MQL timestamp is a formula field referencing Lead/Contact, deduplicate Campaign Members to prospect-level before analysis to remove ~50% noise

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When MQL timestamp is a formula field referencing Lead/Contact, deduplicate Campaign Members to prospect-level before analysis to remove ~50% noise
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6072a06d-4cf2-4208-af70-2bbf2c54eb98
- **Agent**: manual analysis
- **Enriched**: 2026-04-03
