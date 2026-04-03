---
name: dlrs-type-mismatch-resolution-via-formula-bridge
description: "When DLRS fails due to Datetime-to-Date type mismatch, create an intermediate formula field on the child object using DATEVALUE() to convert Datetime to Date, then update the DLRS rollup to use the formula field as source."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-metadata-manager
---

# Dlrs Type Mismatch Resolution Via Formula Bridge

When DLRS fails due to Datetime-to-Date type mismatch, create an intermediate formula field on the child object using DATEVALUE() to convert Datetime to Date, then update the DLRS rollup to use the formula field as source.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: fix
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When DLRS fails due to Datetime-to-Date type mismatch, create an intermediate formula field on the child object using DATEVALUE() to convert Datetime to Date, then update the DLRS rollup to use the formula field as source.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 22fa5b48-8ae0-4d31-a14a-ad02040758f4
- **Agent**: sfdc-metadata-manager
- **Enriched**: 2026-04-03
