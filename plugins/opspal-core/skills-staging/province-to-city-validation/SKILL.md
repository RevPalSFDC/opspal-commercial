---
name: province-to-city-validation
description: "Flag records where BillingCity matches province names/abbreviations as data quality issues"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-data-operations
---

# Province To City Validation

Flag records where BillingCity matches province names/abbreviations as data quality issues

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Flag records where BillingCity matches province names/abbreviations as data quality issues
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 3f3dddf0-cc84-42ab-a851-c252339f4f4c
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
