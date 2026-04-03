---
name: territory-account-count-cross-validation
description: "When territory counts seem incorrect, query ObjectTerritory2Association grouped by territory AND cross-reference with rule criteria query to identify assignment gaps"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-execution
---

# Territory Account Count Cross Validation

When territory counts seem incorrect, query ObjectTerritory2Association grouped by territory AND cross-reference with rule criteria query to identify assignment gaps

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When territory counts seem incorrect, query ObjectTerritory2Association grouped by territory AND cross-reference with rule criteria query to identify assignment gaps
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 9518fb2b-543f-4ff9-b328-d6634dbe7afe
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
