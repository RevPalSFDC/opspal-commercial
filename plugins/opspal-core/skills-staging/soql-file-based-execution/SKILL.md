---
name: soql-file-based-execution
description: "Write SOQL to .soql file and use sf data query --file to avoid shell escaping of !=, <, >, % characters"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-execution
---

# Soql File Based Execution

Write SOQL to .soql file and use sf data query --file to avoid shell escaping of !=, <, >, % characters

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Write SOQL to
2. soql file and use sf data query --file to avoid shell escaping of !=, <, >, % characters

## Source

- **Reflection**: 62793c36-7be6-4bef-b2c0-6122ad06eb5b
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
