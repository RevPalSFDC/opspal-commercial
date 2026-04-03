---
name: state-prefix-to-full-state-name-mapping
description: "Extract 2-letter state prefix from Account.Name, map to full state name for BillingState correction"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# State Prefix To Full State Name Mapping

Extract 2-letter state prefix from Account.Name, map to full state name for BillingState correction

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Extract 2-letter state prefix from Account
2. Name, map to full state name for BillingState correction

## Source

- **Reflection**: 23c7f008-7cec-4bff-8ff0-8fdee6f924a6
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
