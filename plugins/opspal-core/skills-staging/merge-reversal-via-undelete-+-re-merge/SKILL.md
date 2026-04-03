---
name: merge-reversal-via-undelete-+-re-merge
description: "Undelete wrong-survivor's non-survivor via Database.undelete(), then Database.merge() in correct direction. Follow with field delta reconciliation from backup CSV."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Merge Reversal Via Undelete + Re Merge

Undelete wrong-survivor's non-survivor via Database.undelete(), then Database.merge() in correct direction. Follow with field delta reconciliation from backup CSV.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Undelete wrong-survivor's non-survivor via Database
2. undelete(), then Database
3. merge() in correct direction
4. Follow with field delta reconciliation from backup CSV

## Source

- **Reflection**: 0ec88af6-f676-4ff8-88cc-398de8aa0cfa
- **Agent**: direct execution
- **Enriched**: 2026-04-03
