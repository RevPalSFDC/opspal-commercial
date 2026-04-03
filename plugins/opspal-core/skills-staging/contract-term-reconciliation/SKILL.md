---
name: contract-term-reconciliation
description: "Compare spreadsheet contract dates against Salesforce Contract records, fix StartDate/EndDate/ContractTerm, create missing renewals with correct Renewal_Type__c"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Contract Term Reconciliation

Compare spreadsheet contract dates against Salesforce Contract records, fix StartDate/EndDate/ContractTerm, create missing renewals with correct Renewal_Type__c

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Compare spreadsheet contract dates against Salesforce Contract records, fix StartDate/EndDate/ContractTerm, create missing renewals with correct Renewal_Type__c
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e6f94105-1555-4f88-bc4b-7cd0c7172525
- **Agent**: manual
- **Enriched**: 2026-04-03
