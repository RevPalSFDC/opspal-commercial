---
name: customer-account-filtering
description: "Filter Account queries by customer-identifying fields (New_Logo_Date__c != null) before bulk operations to reduce data volume and improve match accuracy"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:user suggestion
---

# Customer Account Filtering

Filter Account queries by customer-identifying fields (New_Logo_Date__c != null) before bulk operations to reduce data volume and improve match accuracy

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Filter Account queries by customer-identifying fields (New_Logo_Date__c != null) before bulk operations to reduce data volume and improve match accuracy
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4f389c3f-a2f2-4778-a4c9-60caedebcb4a
- **Agent**: user suggestion
- **Enriched**: 2026-04-03
