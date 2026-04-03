---
name: booleanfilter-safe-rule-item-addition
description: "Clear BooleanFilter -> Add Items -> Set New BooleanFilter"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Booleanfilter Safe Rule Item Addition

Clear BooleanFilter -> Add Items -> Set New BooleanFilter

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Clear BooleanFilter -> Add Items -> Set New BooleanFilter
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: bd2a131e-bb89-4492-a606-661309f8a111
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
