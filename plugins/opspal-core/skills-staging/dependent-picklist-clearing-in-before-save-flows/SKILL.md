---
name: dependent-picklist-clearing-in-before-save-flows
description: "When a Before-Save flow modifies a controlling picklist field, always include an assignment to clear the dependent restricted picklist field to blank to prevent validation errors from stale values"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-automation-builder
---

# Dependent Picklist Clearing In Before Save Flows

When a Before-Save flow modifies a controlling picklist field, always include an assignment to clear the dependent restricted picklist field to blank to prevent validation errors from stale values

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern
- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When a Before-Save flow modifies a controlling picklist field, always include an assignment to clear the dependent restricted picklist field to blank to prevent validation errors from stale values
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c4a08214-319d-4f18-a707-d90b3e391fe8
- **Agent**: opspal-salesforce:sfdc-automation-builder
- **Enriched**: 2026-04-03
