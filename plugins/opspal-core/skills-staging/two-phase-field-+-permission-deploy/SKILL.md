---
name: two-phase-field-+-permission-deploy
description: "Deploy custom fields first, then deploy permission set updates in a second deployment to avoid dependency issues"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Two Phase Field + Permission Deploy

Deploy custom fields first, then deploy permission set updates in a second deployment to avoid dependency issues

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Deploy custom fields first, then deploy permission set updates in a second deployment to avoid dependency issues
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 32cf23e8-aca7-45a0-9b26-0642e66b6337
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
