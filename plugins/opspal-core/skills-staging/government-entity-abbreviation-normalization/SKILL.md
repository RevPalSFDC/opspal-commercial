---
name: government-entity-abbreviation-normalization
description: "Expand common government/law enforcement abbreviations (PD→Police Department, SO→Sheriff's Office, DA→District Attorney) before fuzzy matching"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Government Entity Abbreviation Normalization

Expand common government/law enforcement abbreviations (PD→Police Department, SO→Sheriff's Office, DA→District Attorney) before fuzzy matching

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Expand common government/law enforcement abbreviations (PD→Police Department, SO→Sheriff's Office, DA→District Attorney) before fuzzy matching
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4f389c3f-a2f2-4778-a4c9-60caedebcb4a
- **Agent**: manual implementation
- **Enriched**: 2026-04-03
