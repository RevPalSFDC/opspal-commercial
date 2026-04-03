---
name: flow-get-records-null-safety-validation
description: "Scan Flow XML: any Get Records with assignNullValuesIfNoRecordsFound=true whose collection feeds a Loop must be flagged. Fix: set to false."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-deployment-manager
---

# Flow Get Records Null Safety Validation

Scan Flow XML: any Get Records with assignNullValuesIfNoRecordsFound=true whose collection feeds a Loop must be flagged. Fix: set to false.

## When to Use This Skill

- When encountering errors that match this pattern
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Scan Flow XML: any Get Records with assignNullValuesIfNoRecordsFound=true whose collection feeds a Loop must be flagged
2. Fix: set to false

## Source

- **Reflection**: 4a21a7bb-2b75-49f9-98f1-9145612c5a13
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
