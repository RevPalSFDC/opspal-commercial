---
name: think-first-validation
description: "Before executing any plan or user instruction involving file paths, explore the actual codebase structure and validate assumptions"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:main-agent
---

# Think First Validation

Before executing any plan or user instruction involving file paths, explore the actual codebase structure and validate assumptions

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before executing any plan or user instruction involving file paths, explore the actual codebase structure and validate assumptions
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f6ecc1d3-e619-4ca7-a339-d7a8d9210c6f
- **Agent**: main-agent
- **Enriched**: 2026-04-03
