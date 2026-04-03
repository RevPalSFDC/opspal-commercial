---
name: soql-semi-join-split-and-merge
description: "When SOQL semi-join subselect cannot be used in OR clause, split into two queries and merge with dedup by Id in Node.js"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct execution
---

# Soql Semi Join Split And Merge

When SOQL semi-join subselect cannot be used in OR clause, split into two queries and merge with dedup by Id in Node.js

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When SOQL semi-join subselect cannot be used in OR clause, split into two queries and merge with dedup by Id in Node.js
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c5bf2354-6ce4-4afb-8d64-5e41e2651e2a
- **Agent**: direct execution
- **Enriched**: 2026-04-03
