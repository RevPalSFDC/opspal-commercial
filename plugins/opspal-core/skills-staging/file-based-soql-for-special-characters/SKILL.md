---
name: file-based-soql-for-special-characters
description: "Write SOQL to temp .soql file and use --file flag to avoid bash shell escaping of !=, !, and other special characters"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct execution
---

# File Based Soql For Special Characters

Write SOQL to temp .soql file and use --file flag to avoid bash shell escaping of !=, !, and other special characters

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Write SOQL to temp
2. soql file and use --file flag to avoid bash shell escaping of !=, !, and other special characters

## Source

- **Reflection**: 6da61b6f-d0ab-4ed4-9822-7e4c45741c32
- **Agent**: direct execution
- **Enriched**: 2026-04-03
