---
name: flow-assignment-order-auditor
description: "Parse Flow XML to detect premature collection Add operations in assignment elements, where sObject fields are assigned after the Add snapshot"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Flow Assignment Order Auditor

Parse Flow XML to detect premature collection Add operations in assignment elements, where sObject fields are assigned after the Add snapshot

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Parse Flow XML to detect premature collection Add operations in assignment elements, where sObject fields are assigned after the Add snapshot
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 839db155-a4c6-44a9-98e7-90bf0c8a4383
- **Agent**: manual analysis
- **Enriched**: 2026-04-03
