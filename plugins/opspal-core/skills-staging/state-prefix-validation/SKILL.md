---
name: state-prefix-validation
description: "Cross-reference account Name state prefix against US county database and BillingState field to identify data entry errors"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-query-specialist
---

# State Prefix Validation

Cross-reference account Name state prefix against US county database and BillingState field to identify data entry errors

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Cross-reference account Name state prefix against US county database and BillingState field to identify data entry errors
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 09be3c6b-81b1-47de-9227-d6a897af1150
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
