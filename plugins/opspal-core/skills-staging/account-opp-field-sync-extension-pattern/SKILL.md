---
name: account-opp-field-sync-extension-pattern
description: "Extending existing After-Insert and After-Update flows to sync additional fields from [COMPANY] to Opportunity, following the same [SFDC_ID] and trigger filter patterns"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Account Opp Field Sync Extension Pattern

Extending existing After-Insert and After-Update flows to sync additional fields from [COMPANY] to Opportunity, following the same [SFDC_ID] and trigger filter patterns

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Extending existing After-Insert and After-Update flows to sync additional fields from [COMPANY] to Opportunity, following the same [SFDC_ID] and trigger filter patterns
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 42f5cb86-9070-4cdf-a9e3-603b212f69cf
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
