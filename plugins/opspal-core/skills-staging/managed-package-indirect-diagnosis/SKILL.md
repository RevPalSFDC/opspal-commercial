---
name: managed-package-indirect-diagnosis
description: "When managed code is hidden: search visible code for error text, list namespaced triggers/classes/objects, compare affected vs successful records, query config objects, enable trace flags"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-automation-auditor
---

# Managed Package Indirect Diagnosis

When managed code is hidden: search visible code for error text, list namespaced triggers/classes/objects, compare affected vs successful records, query config objects, enable trace flags

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When managed code is hidden: search visible code for error text, list namespaced triggers/classes/objects, compare affected vs successful records, query config objects, enable trace flags
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 8ed1c818-3c5d-430e-af8a-78f2d72fac98
- **Agent**: opspal-salesforce:sfdc-automation-auditor
- **Enriched**: 2026-04-03
