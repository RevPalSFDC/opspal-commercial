---
name: corporate-hierarchy-detection-in-dedup
description: "Before merge, compare employee counts and Description fields across accounts to detect parent/subsidiary relationships that should override activity-based survivor selection."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Corporate Hierarchy Detection In Dedup

Before merge, compare employee counts and Description fields across accounts to detect parent/subsidiary relationships that should override activity-based survivor selection.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before merge, compare employee counts and Description fields across accounts to detect parent/subsidiary relationships that should override activity-based survivor selection.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 0ec88af6-f676-4ff8-88cc-398de8aa0cfa
- **Agent**: direct execution
- **Enriched**: 2026-04-03
