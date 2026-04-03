---
name: campaignmember-based-post-import-record-matching
description: "For post-import operations on event leads, query [SFDC_ID] to get SF record IDs rather than re-querying by email. Match back to spreadsheet by SF email first, then FirstName+LastName."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct execution
---

# Campaignmember Based Post Import Record Matching

For post-import operations on event leads, query [SFDC_ID] to get SF record IDs rather than re-querying by email. Match back to spreadsheet by SF email first, then FirstName+LastName.

## When to Use This Skill

- During data import or bulk operations

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. For post-import operations on event leads, query [SFDC_ID] to get SF record IDs rather than re-querying by email
2. Match back to spreadsheet by SF email first, then FirstName+LastName

## Source

- **Reflection**: 8304aba1-deb2-49a9-a825-349341a4e324
- **Agent**: direct execution
- **Enriched**: 2026-04-03
