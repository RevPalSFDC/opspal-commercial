---
name: vr-deadlock-detection
description: "Detect validation rules whose formulas reference non-existent fields, creating impossible-to-satisfy conditions that block record saves."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:uat-orchestrator
---

# Vr Deadlock Detection

Detect validation rules whose formulas reference non-existent fields, creating impossible-to-satisfy conditions that block record saves.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Detect validation rules whose formulas reference non-existent fields, creating impossible-to-satisfy conditions that block record saves.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e29b5d80-3be5-48bd-b0ed-3bd737144f3f
- **Agent**: opspal-core:uat-orchestrator
- **Enriched**: 2026-04-03
