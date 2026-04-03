---
name: hubspot-source-type-interpretation
description: "Map HubSpot sourceType values to human-readable descriptions: SALESFORCE=Sync, AUTOMATION_PLATFORM=Workflow, CRM_UI=Manual, INTERNAL_PROCESSING=System automation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: hubspot-plugin:hubspot-analytics-reporter
---

# Hubspot Source Type Interpretation

Map HubSpot sourceType values to human-readable descriptions: SALESFORCE=Sync, AUTOMATION_PLATFORM=Workflow, CRM_UI=Manual, INTERNAL_PROCESSING=System automation

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Map HubSpot sourceType values to human-readable descriptions: SALESFORCE=Sync, AUTOMATION_PLATFORM=Workflow, CRM_UI=Manual, INTERNAL_PROCESSING=System automation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 40d7fc0f-fd75-44cd-af72-534d71221a33
- **Agent**: hubspot-plugin:hubspot-analytics-reporter
- **Enriched**: 2026-04-03
