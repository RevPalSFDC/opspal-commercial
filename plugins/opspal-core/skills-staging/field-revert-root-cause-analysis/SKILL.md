---
name: field-revert-root-cause-analysis
description: "When a field keeps reverting: (1) enumerate all automation on the object, (2) check debug logs for the update DML, (3) identify which automation fires and overwrites, (4) fix entry conditions or trigger type"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Field Revert Root Cause Analysis

When a field keeps reverting: (1) enumerate all automation on the object, (2) check debug logs for the update DML, (3) identify which automation fires and overwrites, (4) fix entry conditions or trigger type

## When to Use This Skill

- When encountering errors that match this pattern
- When working with Salesforce Flows or automation

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When a field keeps reverting: (1) enumerate all automation on the object, (2) check debug logs for the update DML, (3) identify which automation fires and overwrites, (4) fix entry conditions or trigger type
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 875e15b5-0ccb-400f-9ce8-33d840151575
- **Agent**: manual
- **Enriched**: 2026-04-03
