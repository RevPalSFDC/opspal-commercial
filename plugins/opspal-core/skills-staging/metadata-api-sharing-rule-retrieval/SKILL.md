---
name: metadata-api-sharing-rule-retrieval
description: "Use sf project retrieve --metadata SharingCriteriaRule instead of SOQL query for sharing rule validation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-security-admin
---

# Metadata Api Sharing Rule Retrieval

Use sf project retrieve --metadata SharingCriteriaRule instead of SOQL query for sharing rule validation

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use sf project retrieve --metadata SharingCriteriaRule instead of SOQL query for sharing rule validation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 36321d49-144c-43b7-91fc-d69b454dc422
- **Agent**: sfdc-security-admin
- **Enriched**: 2026-04-03
