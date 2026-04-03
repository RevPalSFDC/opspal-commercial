---
name: multi-strategy-county-matching
description: "Cascade through multiple matching strategies: picklist > agency_county > name_county > city_lookup > name_city > fuzzy"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Multi Strategy County Matching

Cascade through multiple matching strategies: picklist > agency_county > name_county > city_lookup > name_city > fuzzy

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Cascade through multiple matching strategies: picklist > agency_county > name_county > city_lookup > name_city > fuzzy
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: fe766505-2b5e-42a6-8a2f-2f4e87f734de
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
