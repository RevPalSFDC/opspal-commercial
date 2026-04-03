---
name: picklist-dependency-resolution
description: "Query existing Account with valid picklist values to discover required controlling/dependent field combinations"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Picklist Dependency Resolution

Query existing Account with valid picklist values to discover required controlling/dependent field combinations

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query existing Account with valid picklist values to discover required controlling/dependent field combinations
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 15246fd8-452d-43bb-a1e5-0b3b8dd9546e
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
