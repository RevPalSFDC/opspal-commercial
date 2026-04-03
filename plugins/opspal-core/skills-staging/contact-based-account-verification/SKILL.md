---
name: contact-based-account-verification
description: "Use contact addresses/emails to verify correct state for accounts with ambiguous county names"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-query-specialist
---

# Contact Based Account Verification

Use contact addresses/emails to verify correct state for accounts with ambiguous county names

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use contact addresses/emails to verify correct state for accounts with ambiguous county names
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 09be3c6b-81b1-47de-9227-d6a897af1150
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
