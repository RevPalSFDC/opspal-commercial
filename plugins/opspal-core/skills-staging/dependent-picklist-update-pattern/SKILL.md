---
name: dependent-picklist-update-pattern
description: "Before updating a restricted picklist field, describe the field to check for dependentPicklist=true and controllerName. If dependent, must set the controlling field first or simultaneously via Apex DML (sf data update record cannot reliably handle this)."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-cpq-assessor
---

# Dependent Picklist Update Pattern

Before updating a restricted picklist field, describe the field to check for dependentPicklist=true and controllerName. If dependent, must set the controlling field first or simultaneously via Apex DML (sf data update record cannot reliably handle this).

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Before updating a restricted picklist field, describe the field to check for dependentPicklist=true and controllerName
2. If dependent, must set the controlling field first or simultaneously via Apex DML (sf data update record cannot reliably handle this)

## Source

- **Reflection**: ac2a260f-0163-4882-9447-d29b7cc7ad37
- **Agent**: sfdc-cpq-assessor
- **Enriched**: 2026-04-03
