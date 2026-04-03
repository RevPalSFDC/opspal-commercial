---
name: territory-boolean-filter-validation
description: "Before activating territory rules, validate that segmentation filters (Account_Segmentation__c) are in AND position with state filters, not OR position. Pattern: (sector filters) AND (state filters) AND (segmentation filter)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory Boolean Filter Validation

Before activating territory rules, validate that segmentation filters (Account_Segmentation__c) are in AND position with state filters, not OR position. Pattern: (sector filters) AND (state filters) AND (segmentation filter)

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before activating territory rules, validate that segmentation filters (Account_Segmentation__c) are in AND position with state filters, not OR position
2. Pattern: (sector filters) AND (state filters) AND (segmentation filter)

## Source

- **Reflection**: 76490d6e-0ebc-4560-abe7-9d962139b31c
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
