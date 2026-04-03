---
name: territory-rule-consolidation-via-contains-operator
description: "Use 'contains' operator with comma-separated values to consolidate multiple individual rule items into one, bypassing 10-item limit"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Territory Rule Consolidation Via Contains Operator

Use 'contains' operator with comma-separated values to consolidate multiple individual rule items into one, bypassing 10-item limit

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use 'contains' operator with comma-separated values to consolidate multiple individual rule items into one, bypassing 10-item limit
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 0a315617-4940-4430-9762-0e259aeabb98
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
