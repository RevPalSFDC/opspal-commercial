---
name: territory-rule-county-validation
description: "Compare territory rule Utility_County_Name__c contains values against ca-county-mapping.json to detect missing counties"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Territory Rule County Validation

Compare territory rule Utility_County_Name__c contains values against ca-county-mapping.json to detect missing counties

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Compare territory rule Utility_County_Name__c contains values against ca-county-mapping
2. json to detect missing counties

## Source

- **Reflection**: 0fdbb795-7b79-43db-9a18-f6b2fc655cc7
- **Agent**: manual
- **Enriched**: 2026-04-03
