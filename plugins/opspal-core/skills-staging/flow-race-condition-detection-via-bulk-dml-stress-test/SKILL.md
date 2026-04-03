---
name: flow-race-condition-detection-via-bulk-dml-stress-test
description: "Use Anonymous Apex to update N records in a single DML, then count created related records. If count > 1 for a record that should be unique, the flow has a race condition on the Create Records element."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Flow Race Condition Detection Via Bulk Dml Stress Test

Use Anonymous Apex to update N records in a single DML, then count created related records. If count > 1 for a record that should be unique, the flow has a race condition on the Create Records element.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Use Anonymous Apex to update N records in a single DML, then count created related records
2. If count > 1 for a record that should be unique, the flow has a race condition on the Create Records element

## Source

- **Reflection**: c136889b-1968-41ac-996b-7f637a7ce505
- **Agent**: manual (stress test script)
- **Enriched**: 2026-04-03
