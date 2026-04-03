---
name: sf-cli-text-field-safe-creation
description: "When sf data create record --values fails on text containing special characters, create record without the field first, then update the field separately"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-data-operations
---

# Sf Cli Text Field Safe Creation

When sf data create record --values fails on text containing special characters, create record without the field first, then update the field separately

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When sf data create record --values fails on text containing special characters, create record without the field first, then update the field separately
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 0a30399d-591f-4f4e-810d-efd53437f60d
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
