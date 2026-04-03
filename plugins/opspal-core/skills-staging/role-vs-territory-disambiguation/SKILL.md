---
name: role-vs-territory-disambiguation
description: "Check URL patterns (/setup/Roles/ vs /setup/Territory2/) when user provides Salesforce URLs to determine which hierarchy they're referring to"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-security-admin
---

# Role Vs Territory Disambiguation

Check URL patterns (/setup/Roles/ vs /setup/Territory2/) when user provides Salesforce URLs to determine which hierarchy they're referring to

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Check URL patterns (/setup/Roles/ vs /setup/Territory2/) when user provides Salesforce URLs to determine which hierarchy they're referring to
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 15b94ebc-27d8-40ed-8278-c07fbfff5429
- **Agent**: sfdc-security-admin
- **Enriched**: 2026-04-03
