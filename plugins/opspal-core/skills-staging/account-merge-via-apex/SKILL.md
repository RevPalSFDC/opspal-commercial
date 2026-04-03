---
name: account-merge-via-apex
description: "Use sf apex run with [COMPANY].merge(survivor, loser) for account merges. REST merge endpoint not accessible via sf api request rest."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Account Merge Via Apex

Use sf apex run with [COMPANY].merge(survivor, loser) for account merges. REST merge endpoint not accessible via sf api request rest.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Use sf apex run with [COMPANY]
2. merge(survivor, loser) for account merges
3. REST merge endpoint not accessible via sf api request rest

## Source

- **Reflection**: 15175270-9c09-41a2-a3cc-bc82714eb049
- **Agent**: manual discovery during merge attempt
- **Enriched**: 2026-04-03
