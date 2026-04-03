---
name: ota-dml-via-apex
description: "ObjectTerritory2Association requires Apex Database.insert/delete for [COMPANY] operations. Bulk API returns 'No create/update access'. Use anonymous Apex with [COMPANY].SaveResult[] for partial success handling."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Ota Dml Via Apex

ObjectTerritory2Association requires Apex Database.insert/delete for [COMPANY] operations. Bulk API returns 'No create/update access'. Use anonymous Apex with [COMPANY].SaveResult[] for partial success handling.

## When to Use This Skill

- During data import or bulk operations

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. ObjectTerritory2Association requires Apex Database
2. insert/delete for [COMPANY] operations
3. Bulk API returns 'No create/update access'
4. Use anonymous Apex with [COMPANY]
5. SaveResult[] for partial success handling

## Source

- **Reflection**: 66989d87-c46c-4ca2-96da-56e8ddb69d05
- **Agent**: manual execution
- **Enriched**: 2026-04-03
