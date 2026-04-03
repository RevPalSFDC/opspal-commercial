---
name: dlrs-delete-prevention-pattern
description: "Use DLRS Realtime rollup to count child records, then validation rule to prevent count decrease on locked parent records. This provides delete prevention without Apex or Before Delete flows."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Dlrs Delete Prevention Pattern

Use DLRS Realtime rollup to count child records, then validation rule to prevent count decrease on locked parent records. This provides delete prevention without Apex or Before Delete flows.

## When to Use This Skill

- Before executing the operation described in this skill
- When working with Salesforce Flows or automation

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Use DLRS Realtime rollup to count child records, then validation rule to prevent count decrease on locked parent records
2. This provides delete prevention without Apex or Before Delete flows

## Source

- **Reflection**: b0b9bafe-2fb7-44d4-afe8-c045d4a56bfd
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
