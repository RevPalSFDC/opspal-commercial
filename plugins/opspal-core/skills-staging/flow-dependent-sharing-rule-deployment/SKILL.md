---
name: flow-dependent-sharing-rule-deployment
description: "When sharing rules depend on field values populated by flows, must trigger flows on existing records after deployment to sync [SFDC_ID]"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Flow Dependent Sharing Rule Deployment

When sharing rules depend on field values populated by flows, must trigger flows on existing records after deployment to sync [SFDC_ID]

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When sharing rules depend on field values populated by flows, must trigger flows on existing records after deployment to sync [SFDC_ID]
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 36321d49-144c-43b7-91fc-d69b454dc422
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
