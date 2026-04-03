---
name: formula-field-dependency-ordering
description: "Query fields with calculated=true, delete these before their referenced fields"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Formula Field Dependency Ordering

Query fields with calculated=true, delete these before their referenced fields

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query fields with calculated=true, delete these before their referenced fields
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a66cb090-746c-4c51-b9c2-b9471d8450d6
- **Agent**: manual-analysis
- **Enriched**: 2026-04-03
