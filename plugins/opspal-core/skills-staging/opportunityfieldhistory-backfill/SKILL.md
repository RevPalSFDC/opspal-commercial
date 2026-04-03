---
name: opportunityfieldhistory-backfill
description: "Query OpportunityFieldHistory to reconstruct stage progression timeline, compute date stamps using earliest-entry logic with [COMPANY] fallback for starting stage, and generate bulk update CSV"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Opportunityfieldhistory Backfill

Query OpportunityFieldHistory to reconstruct stage progression timeline, compute date stamps using earliest-entry logic with [COMPANY] fallback for starting stage, and generate bulk update CSV

## When to Use This Skill

- During data import or bulk operations

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query OpportunityFieldHistory to reconstruct stage progression timeline, compute date stamps using earliest-entry logic with [COMPANY] fallback for starting stage, and generate bulk update CSV
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 73a54e9c-1de2-4333-be70-56d50e8727b2
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
