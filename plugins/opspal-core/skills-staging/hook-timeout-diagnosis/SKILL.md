---
name: hook-timeout-diagnosis
description: "Systematically test each registered hook in isolation to identify which ones hang or error, then trace root cause to stdin blocking or network timeouts"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct
---

# Hook Timeout Diagnosis

Systematically test each registered hook in isolation to identify which ones hang or error, then trace root cause to stdin blocking or network timeouts

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Systematically test each registered hook in isolation to identify which ones hang or error, then trace root cause to stdin blocking or network timeouts
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 262c9553-db76-4b62-8d3b-7af7081cbab1
- **Agent**: direct
- **Enriched**: 2026-04-03
