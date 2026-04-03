---
name: cross-platform-id-matching-via-custom-field
description: "When no native HubSpot-SF sync exists, use a custom field (HubSpot_Company_ID__c) on SF Account to build a cross-reference map for enrichment"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-query-specialist
---

# Cross Platform Id Matching Via Custom Field

When no native HubSpot-SF sync exists, use a custom field (HubSpot_Company_ID__c) on SF Account to build a cross-reference map for enrichment

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When no native HubSpot-SF sync exists, use a custom field (HubSpot_Company_ID__c) on SF Account to build a cross-reference map for enrichment
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 7f1a0bdf-4618-414a-aded-04f951aa9979
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
