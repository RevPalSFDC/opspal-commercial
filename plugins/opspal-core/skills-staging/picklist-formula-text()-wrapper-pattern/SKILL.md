---
name: picklist-formula-text()-wrapper-pattern
description: "When building Salesforce formula fields that reference picklist fields, always wrap in TEXT() for equality comparisons. Deploy error message: 'Picklist fields are only supported in certain functions.'"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Picklist Formula Text() Wrapper Pattern

When building Salesforce formula fields that reference picklist fields, always wrap in TEXT() for equality comparisons. Deploy error message: 'Picklist fields are only supported in certain functions.'

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. When building Salesforce formula fields that reference picklist fields, always wrap in TEXT() for equality comparisons
2. Deploy error message: 'Picklist fields are only supported in certain functions

## Source

- **Reflection**: 62e50e82-30be-42fe-bb9a-ca96094d9f89
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
