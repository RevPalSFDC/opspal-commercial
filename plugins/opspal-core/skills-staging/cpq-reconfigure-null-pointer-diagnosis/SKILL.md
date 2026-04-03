---
name: cpq-reconfigure-null-pointer-diagnosis
description: "When CPQ Edit Lines throws null pointer: (1) check server logs for [COMPANY]=Success to determine if client-side JS error, (2) validate ProductOption references on all bundle child lines, (3) validate subscription type fields with dependent picklist awareness, (4) check bundle hierarchy consistency flags"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-cpq-assessor
---

# Cpq Reconfigure Null Pointer Diagnosis

When CPQ Edit Lines throws null pointer: (1) check server logs for [COMPANY]=Success to determine if client-side JS error, (2) validate ProductOption references on all bundle child lines, (3) validate subscription type fields with dependent picklist awareness, (4) check bundle hierarchy consistency flags

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When CPQ Edit Lines throws null pointer: (1) check server logs for [COMPANY]=Success to determine if client-side JS error, (2) validate ProductOption references on all bundle child lines, (3) validate subscription type fields with dependent picklist awareness, (4) check bundle hierarchy consistency flags
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ac2a260f-0163-4882-9447-d29b7cc7ad37
- **Agent**: sfdc-cpq-assessor
- **Enriched**: 2026-04-03
