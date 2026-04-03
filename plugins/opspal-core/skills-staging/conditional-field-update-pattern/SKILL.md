---
name: conditional-field-update-pattern
description: "Query current SFDC values, compare with source data, only update fields where SFDC is blank and source has value"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:Manual Python script
---

# Conditional Field Update Pattern

Query current SFDC values, compare with source data, only update fields where SFDC is blank and source has value

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query current SFDC values, compare with source data, only update fields where SFDC is blank and source has value
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6047c752-6c35-4de0-af0a-2a5d3647c0af
- **Agent**: Manual Python script
- **Enriched**: 2026-04-03
