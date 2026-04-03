---
name: inactive-owner-reparent-fix
description: "CANNOT_REPARENT_RECORD error → query Contact.Owner.IsActive → update OwnerId to fallback active user → retry AccountId update"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct execution
---

# Inactive Owner Reparent Fix

CANNOT_REPARENT_RECORD error → query Contact.Owner.IsActive → update OwnerId to fallback active user → retry AccountId update

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. CANNOT_REPARENT_RECORD error → query Contact
2. IsActive → update OwnerId to fallback active user → retry AccountId update

## Source

- **Reflection**: 8ebcce08-e26d-41e7-992b-231ce1fda7a8
- **Agent**: direct execution
- **Enriched**: 2026-04-03
