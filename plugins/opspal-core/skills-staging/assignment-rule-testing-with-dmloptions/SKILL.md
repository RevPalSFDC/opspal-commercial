---
name: assignment-rule-testing-with-dmloptions
description: "Use Database.DMLOptions.assignmentRuleHeader.useDefaultRule = true to trigger assignment rules in Apex; execute tests sequentially to avoid SOQL limits when flows are involved"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-deployment-manager
---

# Assignment Rule Testing With Dmloptions

Use Database.DMLOptions.assignmentRuleHeader.useDefaultRule = true to trigger assignment rules in Apex; execute tests sequentially to avoid SOQL limits when flows are involved

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Use Database
2. assignmentRuleHeader
3. useDefaultRule = true to trigger assignment rules in Apex
4. execute tests sequentially to avoid SOQL limits when flows are involved

## Source

- **Reflection**: cc9bf8e6-a213-4816-9c45-6e87744ec8d3
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
