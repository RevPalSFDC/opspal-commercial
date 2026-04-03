---
name: territory-rule-apex-modification-pattern
description: "Use Anonymous Apex 3-step pattern (clear filter, DML item, set filter) when REST API blocked by BooleanFilter constraint"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Territory Rule Apex Modification Pattern

Use Anonymous Apex 3-step pattern (clear filter, DML item, set filter) when REST API blocked by BooleanFilter constraint

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use Anonymous Apex 3-step pattern (clear filter, DML item, set filter) when REST API blocked by BooleanFilter constraint
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 0054eac1-747f-4b0c-9705-58fcff7e89ec
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
