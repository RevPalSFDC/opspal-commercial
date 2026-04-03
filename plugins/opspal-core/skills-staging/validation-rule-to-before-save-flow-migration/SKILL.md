---
name: validation-rule-to-before-save-flow-migration
description: "When validation rules conflict with After-Save Flows, replace with Before-Save Flow using $Record__Prior for true prior value access. Use customErrors element for blocking saves."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Validation Rule To Before Save Flow Migration

When validation rules conflict with After-Save Flows, replace with Before-Save Flow using $Record__Prior for true prior value access. Use customErrors element for blocking saves.

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern
- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. When validation rules conflict with After-Save Flows, replace with Before-Save Flow using $Record__Prior for true prior value access
2. Use customErrors element for blocking saves

## Source

- **Reflection**: a625f5ec-010e-4974-a4c3-07f0b3bb0c28
- **Agent**: manual
- **Enriched**: 2026-04-03
