---
name: picklist-case-sensitivity-check
description: "Before coding string comparisons for SFDC picklist values, always query GROUP BY to get exact values including case"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct execution
---

# Picklist Case Sensitivity Check

Before coding string comparisons for SFDC picklist values, always query GROUP BY to get exact values including case

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before coding string comparisons for SFDC picklist values, always query GROUP BY to get exact values including case
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ae22f08b-0c57-449e-99ff-919fad58e8a1
- **Agent**: direct execution
- **Enriched**: 2026-04-03
