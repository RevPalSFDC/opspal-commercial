---
name: flow-picklist-formula-validation
description: "Flow filterFormula elements that compare picklist fields must use TEXT() wrapper. Pattern: TEXT({!$Record.PicklistField}) = 'Value'"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Flow Picklist Formula Validation

Flow filterFormula elements that compare picklist fields must use TEXT() wrapper. Pattern: TEXT({!$Record.PicklistField}) = 'Value'

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Flow filterFormula elements that compare picklist fields must use TEXT() wrapper
2. Pattern: TEXT({!$Record
3. PicklistField}) = 'Value'

## Source

- **Reflection**: 7c9cd6c1-07c8-4579-9932-37da60000ab2
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
