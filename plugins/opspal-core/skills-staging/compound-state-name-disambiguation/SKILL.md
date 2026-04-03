---
name: compound-state-name-disambiguation
description: "When matching US state names, filter out pairs where one name is a substring of another to prevent false positives"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct
---

# Compound State Name Disambiguation

When matching US state names, filter out pairs where one name is a substring of another to prevent false positives

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When matching US state names, filter out pairs where one name is a substring of another to prevent false positives
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: d61b1f5c-5c47-44b5-b758-237dc5a2f947
- **Agent**: direct
- **Enriched**: 2026-04-03
