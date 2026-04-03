---
name: formula-field-fls-validation
description: "Always deploy formula fields with accompanying permission set and verify via SOQL before testing"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Formula Field Fls Validation

Always deploy formula fields with accompanying permission set and verify via SOQL before testing

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Always deploy formula fields with accompanying permission set and verify via SOQL before testing
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: cf0fe5bd-2765-4b85-8138-45c24b3dd0a3
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
