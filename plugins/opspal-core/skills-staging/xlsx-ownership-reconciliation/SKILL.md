---
name: xlsx-ownership-reconciliation
description: "Load Excel proposed owners, resolve to SF User IDs, batch-query Contacts+Leads by email, compare OwnerId, generate fix CSVs with explicit LF line endings"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct (no agent)
---

# Xlsx Ownership Reconciliation

Load Excel proposed owners, resolve to SF User IDs, batch-query Contacts+Leads by email, compare OwnerId, generate fix CSVs with explicit LF line endings

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Load Excel proposed owners, resolve to SF User IDs, batch-query Contacts+Leads by email, compare OwnerId, generate fix CSVs with explicit LF line endings
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e685157c-5939-4def-81b5-e13715cce249
- **Agent**: direct (no agent)
- **Enriched**: 2026-04-03
