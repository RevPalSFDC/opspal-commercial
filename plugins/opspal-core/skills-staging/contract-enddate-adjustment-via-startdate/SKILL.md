---
name: contract-enddate-adjustment-via-startdate
description: "To change Contract EndDate, modify StartDate (EndDate = StartDate + ContractTerm - 1 day)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Contract Enddate Adjustment Via Startdate

To change Contract EndDate, modify StartDate (EndDate = StartDate + ContractTerm - 1 day)

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: To change Contract EndDate, modify StartDate (EndDate = StartDate + ContractTerm - 1 day)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4ccc6dfe-2728-4a27-98b9-fc10b9f0952a
- **Agent**: manual
- **Enriched**: 2026-04-03
