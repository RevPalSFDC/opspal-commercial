---
name: spreadsheet-pipeline-import
description: "Parse Excel forecast tracker, match accounts fuzzy, map informal stages to SF sales process stages, create users/accounts as needed, batch import by stage category with flow-aware sequencing"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-data-operations
---

# Spreadsheet Pipeline Import

Parse Excel forecast tracker, match accounts fuzzy, map informal stages to SF sales process stages, create users/accounts as needed, batch import by stage category with flow-aware sequencing

## When to Use This Skill

- During data import or bulk operations
- When working with Salesforce Flows or automation

**Category**: data-migration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Parse Excel forecast tracker, match accounts fuzzy, map informal stages to SF sales process stages, create users/accounts as needed, batch import by stage category with flow-aware sequencing
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 8da8d56e-523a-44a5-b767-baa1428f6aac
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
