---
name: territory-assignment-fallback-via-objectterritory2association
description: "When the territory assignment job REST API is unavailable (404), create ObjectTerritory2Association records directly via Composite API and update Primary_Territory2 fields manually."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:general-purpose (finalizer)
---

# Territory Assignment Fallback Via Objectterritory2association

When the territory assignment job REST API is unavailable (404), create ObjectTerritory2Association records directly via Composite API and update Primary_Territory2 fields manually.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When the territory assignment job REST API is unavailable (404), create ObjectTerritory2Association records directly via Composite API and update Primary_Territory2 fields manually.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2cd1fc6f-231e-42c1-aa05-1d0e5b666325
- **Agent**: general-purpose (finalizer)
- **Enriched**: 2026-04-03
