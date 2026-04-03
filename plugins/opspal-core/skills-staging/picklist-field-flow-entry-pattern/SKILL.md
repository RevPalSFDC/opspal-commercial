---
name: picklist-field-flow-entry-pattern
description: "When flow entry criteria involves picklist field changes, use declarative filters with doesRequireRecordChangedToMeetCriteria=true instead of filterFormula with [COMPANY]()"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:main-thread (manual fix after sfdc-automation-builder failure)
---

# Picklist Field Flow Entry Pattern

When flow entry criteria involves picklist field changes, use declarative filters with doesRequireRecordChangedToMeetCriteria=true instead of filterFormula with [COMPANY]()

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When flow entry criteria involves picklist field changes, use declarative filters with doesRequireRecordChangedToMeetCriteria=true instead of filterFormula with [COMPANY]()
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ebcf1d91-79eb-4cc9-93cf-820a3989c2c1
- **Agent**: main-thread (manual fix after sfdc-automation-builder failure)
- **Enriched**: 2026-04-03
