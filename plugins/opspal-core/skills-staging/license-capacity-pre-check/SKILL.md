---
name: license-capacity-pre-check
description: "Check license availability before user creation to avoid failed provisioning"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-security-admin
---

# License Capacity Pre Check

Check license availability before user creation to avoid failed provisioning

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Check license availability before user creation to avoid failed provisioning
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: daad878d-58e6-47f8-a7ac-271b045bb57e
- **Agent**: sfdc-security-admin
- **Enriched**: 2026-04-03
