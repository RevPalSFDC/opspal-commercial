---
name: territory2-regular-soql-pattern
description: "Territory2 objects ([SFDC_ID], Territory2, ObjectTerritory2AssignmentRule, RuleTerritory2Association) are queryable via regular SOQL API, not Tooling API. Field names differ from [COMPANY] API docs."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Territory2 Regular Soql Pattern

Territory2 objects ([SFDC_ID], Territory2, ObjectTerritory2AssignmentRule, RuleTerritory2Association) are queryable via regular SOQL API, not Tooling API. Field names differ from [COMPANY] API docs.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Territory2 objects ([SFDC_ID], Territory2, ObjectTerritory2AssignmentRule, RuleTerritory2Association) are queryable via regular SOQL API, not Tooling API
2. Field names differ from [COMPANY] API docs

## Source

- **Reflection**: 9eb81895-76bf-40af-b2c8-4984c4c9ac22
- **Agent**: manual discovery through error iteration
- **Enriched**: 2026-04-03
