---
name: handler-field-preservation-pattern
description: "When handlers/triggers update fields that may also be set by batch jobs, modify handler to only SET values (not clear) when source data exists, preserving externally-set values"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Handler Field Preservation Pattern

When handlers/triggers update fields that may also be set by batch jobs, modify handler to only SET values (not clear) when source data exists, preserving externally-set values

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When handlers/triggers update fields that may also be set by batch jobs, modify handler to only SET values (not clear) when source data exists, preserving externally-set values
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f3cc61ad-711e-40aa-9310-018a6ff6cf8c
- **Agent**: manual-implementation
- **Enriched**: 2026-04-03
