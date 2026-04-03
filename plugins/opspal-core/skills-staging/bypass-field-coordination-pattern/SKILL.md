---
name: bypass-field-coordination-pattern
description: "Use checkbox field to coordinate between Screen Flow (sets bypass=true before update) and Before-Save Flow (checks bypass, clears if true, blocks if false)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-automation-builder
---

# Bypass Field Coordination Pattern

Use checkbox field to coordinate between Screen Flow (sets bypass=true before update) and Before-Save Flow (checks bypass, clears if true, blocks if false)

## When to Use This Skill

- Before executing the operation described in this skill
- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use checkbox field to coordinate between Screen Flow (sets bypass=true before update) and Before-Save Flow (checks bypass, clears if true, blocks if false)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c50ddf87-6023-4f70-97f6-904c5f0fdbb8
- **Agent**: sfdc-automation-builder
- **Enriched**: 2026-04-03
