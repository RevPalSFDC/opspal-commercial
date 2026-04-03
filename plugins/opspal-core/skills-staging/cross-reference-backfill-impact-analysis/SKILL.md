---
name: cross-reference-backfill-impact-analysis
description: "Extract IDs from pre-backfill snapshot, batch-query current state from [COMPANY], filter for records where the backfilled field transitioned from null to populated, output as impacted CSV"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Cross Reference Backfill Impact Analysis

Extract IDs from pre-backfill snapshot, batch-query current state from [COMPANY], filter for records where the backfilled field transitioned from null to populated, output as impacted CSV

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Extract IDs from pre-backfill snapshot, batch-query current state from [COMPANY], filter for records where the backfilled field transitioned from null to populated, output as impacted CSV
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 92dac282-7e39-4865-aa06-29317f04babc
- **Agent**: direct execution
- **Enriched**: 2026-04-03
