---
name: scheduled-flow-governor-limit-diagnosis
description: "When a scheduled flow hits 250K limit: check entry criteria breadth, count matching records, verify exit conditions exist (processed flag or date filter)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-automation-auditor
---

# Scheduled Flow Governor Limit Diagnosis

When a scheduled flow hits 250K limit: check entry criteria breadth, count matching records, verify exit conditions exist (processed flag or date filter)

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When a scheduled flow hits 250K limit: check entry criteria breadth, count matching records, verify exit conditions exist (processed flag or date filter)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e98ce360-6161-47ea-ad61-8f9888be8eea
- **Agent**: opspal-salesforce:sfdc-automation-auditor
- **Enriched**: 2026-04-03
