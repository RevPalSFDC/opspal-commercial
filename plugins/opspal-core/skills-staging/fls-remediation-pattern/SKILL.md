---
name: fls-remediation-pattern
description: "When fields exist but aren't SOQL-accessible, create PermissionSet with fieldPermissions and assign to affected users rather than modifying profiles directly"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Fls Remediation Pattern

When fields exist but aren't SOQL-accessible, create PermissionSet with fieldPermissions and assign to affected users rather than modifying profiles directly

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When fields exist but aren't SOQL-accessible, create PermissionSet with fieldPermissions and assign to affected users rather than modifying profiles directly
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: afae6a79-3839-418b-bd05-498a5b44cc24
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
