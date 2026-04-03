---
name: territory-orphan-detection
description: "Before removing manual territory assignments, cross-reference accounts to identify those whose only Primary Territory source is the assignment being removed. Check handler routing logic (DS/FM/SGA prefixes) to predict which remaining OTA records will populate Primary Territory."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Territory Orphan Detection

Before removing manual territory assignments, cross-reference accounts to identify those whose only Primary Territory source is the assignment being removed. Check handler routing logic (DS/FM/SGA prefixes) to predict which remaining OTA records will populate Primary Territory.

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before removing manual territory assignments, cross-reference accounts to identify those whose only Primary Territory source is the assignment being removed
2. Check handler routing logic (DS/FM/SGA prefixes) to predict which remaining OTA records will populate Primary Territory

## Source

- **Reflection**: 66989d87-c46c-4ca2-96da-56e8ddb69d05
- **Agent**: manual execution
- **Enriched**: 2026-04-03
