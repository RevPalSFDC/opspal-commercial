---
name: sf-task-type-vs-tasksubtype-disambiguation
description: "When Task call counts don't match expectations, check both Type='Call' and TaskSubtype='Call' as they return different record sets"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Sf Task Type Vs Tasksubtype Disambiguation

When Task call counts don't match expectations, check both Type='Call' and TaskSubtype='Call' as they return different record sets

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When Task call counts don't match expectations, check both Type='Call' and TaskSubtype='Call' as they return different record sets
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 9cdc2870-e044-45ae-a1d5-1ed87e2ed541
- **Agent**: manual SOQL analysis
- **Enriched**: 2026-04-03
