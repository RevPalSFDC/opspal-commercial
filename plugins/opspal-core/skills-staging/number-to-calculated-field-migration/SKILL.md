---
name: number-to-calculated-field-migration
description: "When converting Number field to calculated value: (1) Check if field type change is blocked, (2) If blocked, use Before-Save Flow with formula assignment, (3) Update field scale for decimal precision, (4) Preserve dependent automation by using Flow instead of Formula"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Number To Calculated Field Migration

When converting Number field to calculated value: (1) Check if field type change is blocked, (2) If blocked, use Before-Save Flow with formula assignment, (3) Update field scale for decimal precision, (4) Preserve dependent automation by using Flow instead of Formula

## When to Use This Skill

- Before executing the operation described in this skill
- When working with Salesforce Flows or automation

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When converting Number field to calculated value: (1) Check if field type change is blocked, (2) If blocked, use Before-Save Flow with formula assignment, (3) Update field scale for decimal precision, (4) Preserve dependent automation by using Flow instead of Formula
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6d3eb6a9-99e9-4593-a7df-0df95cf3d3e3
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
