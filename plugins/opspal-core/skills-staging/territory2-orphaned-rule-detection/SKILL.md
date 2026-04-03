---
name: territory2-orphaned-rule-detection
description: "Query active rules NOT IN RuleTerritory2Association to find rules that are active but unassigned to any territory"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Territory2 Orphaned Rule Detection

Query active rules NOT IN RuleTerritory2Association to find rules that are active but unassigned to any territory

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query active rules NOT IN RuleTerritory2Association to find rules that are active but unassigned to any territory
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 9eb81895-76bf-40af-b2c8-4984c4c9ac22
- **Agent**: manual SOQL (not yet in any agent)
- **Enriched**: 2026-04-03
