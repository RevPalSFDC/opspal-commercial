---
name: two-phase-dependent-picklist-update
description: "Set controlling field (Market__c) first, then set dependent field (Segment2__c) in second operation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-data-operations
---

# Two Phase Dependent Picklist Update

Set controlling field (Market__c) first, then set dependent field (Segment2__c) in second operation

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Set controlling field (Market__c) first, then set dependent field (Segment2__c) in second operation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 9f716aa2-a5a0-46e6-bf1a-ca1b603b3ffc
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
