---
name: ghost-field-detection-via-tooling-api
description: "Compare Tooling API CustomField records against sobject describe / [SFDC_ID] to identify fields that were deleted but still have ghost metadata records. Ghost records preserve full field definitions including type, formula, help text, and references."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-cli-executor
---

# Ghost Field Detection Via Tooling Api

Compare Tooling API CustomField records against sobject describe / [SFDC_ID] to identify fields that were deleted but still have ghost metadata records. Ghost records preserve full field definitions including type, formula, help text, and references.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Compare Tooling API CustomField records against sobject describe / [SFDC_ID] to identify fields that were deleted but still have ghost metadata records
2. Ghost records preserve full field definitions including type, formula, help text, and references

## Source

- **Reflection**: 7a539d03-c0d4-4e85-8d08-a52549b1f4c3
- **Agent**: sfdc-cli-executor
- **Enriched**: 2026-04-03
