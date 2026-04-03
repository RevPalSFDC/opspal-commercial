---
name: territory-to-cohort-formula-pattern
description: "Use CONTAINS() on territory name strings to derive segment cohort labels (LE/EO/State/SGA). Apply pattern matching in priority order: direct territory assignment -> owner territory fallback -> picklist fallback -> geography fallback. Output cohort labels, not territory names."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-deployment-manager
---

# Territory To Cohort Formula Pattern

Use CONTAINS() on territory name strings to derive segment cohort labels (LE/EO/State/SGA). Apply pattern matching in priority order: direct territory assignment -> owner territory fallback -> picklist fallback -> geography fallback. Output cohort labels, not territory names.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Use CONTAINS() on territory name strings to derive segment cohort labels (LE/EO/State/SGA)
2. Apply pattern matching in priority order: direct territory assignment -> owner territory fallback -> picklist fallback -> geography fallback
3. Output cohort labels, not territory names

## Source

- **Reflection**: 8d620f82-ea28-481e-a50b-b8f40e6059b2
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
