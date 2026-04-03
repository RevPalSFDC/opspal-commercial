---
name: apostrophe-safe-soql-dedup
description: "Split names with apostrophes into separate exact-match query using heredoc with [COMPANY] escaping rather than LIKE wildcards"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-execution
---

# Apostrophe Safe Soql Dedup

Split names with apostrophes into separate exact-match query using heredoc with [COMPANY] escaping rather than LIKE wildcards

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Split names with apostrophes into separate exact-match query using heredoc with [COMPANY] escaping rather than LIKE wildcards
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 52106739-a943-411f-a7c9-f6fcbca87eb9
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
