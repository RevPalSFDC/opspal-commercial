---
name: ds-territory-gap-detection
description: "Query accounts with BillingState != null AND DS_Territory2_Id__c = null, then GROUP BY BillingState to identify mapping gaps"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Ds Territory Gap Detection

Query accounts with BillingState != null AND DS_Territory2_Id__c = null, then GROUP BY BillingState to identify mapping gaps

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query accounts with BillingState != null AND DS_Territory2_Id__c = null, then GROUP BY BillingState to identify mapping gaps
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e4abf003-03ea-44f1-a1e3-d2674d78a978
- **Agent**: manual-execution
- **Enriched**: 2026-04-03
