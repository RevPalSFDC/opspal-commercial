---
name: standard-picklist-rt-restriction-+-backfill
description: "Deploy StandardValueSet first, then RT restrictions, then bulk backfill existing records by RT"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:direct execution + sfdc-bulkops-orchestrator
---

# Standard Picklist Rt Restriction + Backfill

Deploy StandardValueSet first, then RT restrictions, then bulk backfill existing records by RT

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- During data import or bulk operations

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Deploy StandardValueSet first, then RT restrictions, then bulk backfill existing records by RT
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: b5e526d6-ef30-414a-a4c1-9d4bf935374c
- **Agent**: direct execution + sfdc-bulkops-orchestrator
- **Enriched**: 2026-04-03
