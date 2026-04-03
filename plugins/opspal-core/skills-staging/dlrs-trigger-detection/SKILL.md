---
name: dlrs-trigger-detection
description: "Identify DLRS package presence by checking for dlrs_* prefixed triggers on objects"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Dlrs Trigger Detection

Identify DLRS package presence by checking for dlrs_* prefixed triggers on objects

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Identify DLRS package presence by checking for dlrs_* prefixed triggers on objects
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 60823044-0d0c-49f1-afc9-9fd675807da9
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
