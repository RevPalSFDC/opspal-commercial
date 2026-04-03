---
name: territory-structure-comparison
description: "Compare territory structures between orgs before replication to identify existing matches"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory Structure Comparison

Compare territory structures between orgs before replication to identify existing matches

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Compare territory structures between orgs before replication to identify existing matches
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: dbf3567b-e371-4dba-913c-590270cdd128
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
