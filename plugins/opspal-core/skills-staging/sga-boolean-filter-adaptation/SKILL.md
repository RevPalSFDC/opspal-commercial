---
name: sga-boolean-filter-adaptation
description: "When FM_Territory_Name__c is not populated for a territory segment (e.g., SGA), adapt filters to use the boolean flag field (FY26_SLE_Account__c) instead of the territory name stamp"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-reports-dashboards
---

# Sga Boolean Filter Adaptation

When FM_Territory_Name__c is not populated for a territory segment (e.g., SGA), adapt filters to use the boolean flag field (FY26_SLE_Account__c) instead of the territory name stamp

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. When FM_Territory_Name__c is not populated for a territory segment (e
2. , SGA), adapt filters to use the boolean flag field (FY26_SLE_Account__c) instead of the territory name stamp

## Source

- **Reflection**: 5c11dccd-94d2-45be-a726-10d4a731028f
- **Agent**: opspal-salesforce:sfdc-reports-dashboards
- **Enriched**: 2026-04-03
