---
name: federal-agency-name-normalization
description: "Expand federal agency abbreviations to full names with [COMPANY]: prefix and parenthetical abbreviation (e.g., USMS -> FED: United States Marshals Service (USMS))"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-upsert-orchestrator
---

# Federal Agency Name Normalization

Expand federal agency abbreviations to full names with [COMPANY]: prefix and parenthetical abbreviation (e.g., USMS -> FED: United States Marshals Service (USMS))

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Expand federal agency abbreviations to full names with [COMPANY]: prefix and parenthetical abbreviation (e
2. , USMS -> FED: United States Marshals Service (USMS))

## Source

- **Reflection**: 0a30399d-591f-4f4e-810d-efd53437f60d
- **Agent**: sfdc-upsert-orchestrator
- **Enriched**: 2026-04-03
