---
name: formula-field-pre-flight-guard
description: "Before generating Bulk API upload CSVs, query Tooling API CustomField for [COMPANY]=true to exclude formula fields from upload columns"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Formula Field Pre Flight Guard

Before generating Bulk API upload CSVs, query Tooling API CustomField for [COMPANY]=true to exclude formula fields from upload columns

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before generating Bulk API upload CSVs, query Tooling API CustomField for [COMPANY]=true to exclude formula fields from upload columns
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 15175270-9c09-41a2-a3cc-bc82714eb049
- **Agent**: manual discovery during upload failure
- **Enriched**: 2026-04-03
