---
name: hierarchy-mismatch-detection
description: "Query parent-child relationships where state prefixes don't match, categorize by fix type (re-parent to county, re-parent to state, unlink)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-query-specialist
---

# Hierarchy Mismatch Detection

Query parent-child relationships where state prefixes don't match, categorize by fix type (re-parent to county, re-parent to state, unlink)

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query parent-child relationships where state prefixes don't match, categorize by fix type (re-parent to county, re-parent to state, unlink)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 09be3c6b-81b1-47de-9227-d6a897af1150
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
