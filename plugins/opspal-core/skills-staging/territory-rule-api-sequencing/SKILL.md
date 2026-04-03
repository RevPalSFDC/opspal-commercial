---
name: territory-rule-api-sequencing
description: "When creating territory rules via Data API: 1) Create rule inactive without BooleanFilter, 2) Create rule-territory association, 3) Create rule items, 4) Update rule with BooleanFilter and activate. This avoids the dependency errors."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory Rule Api Sequencing

When creating territory rules via Data API: 1) Create rule inactive without BooleanFilter, 2) Create rule-territory association, 3) Create rule items, 4) Update rule with BooleanFilter and activate. This avoids the dependency errors.

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When creating territory rules via Data API: 1) Create rule inactive without BooleanFilter, 2) Create rule-territory association, 3) Create rule items, 4) Update rule with BooleanFilter and activate
2. This avoids the dependency errors

## Source

- **Reflection**: 775e2bc7-9730-4eb2-9582-ca26b1801bee
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
