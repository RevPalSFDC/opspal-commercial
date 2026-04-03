---
name: field-limit-pre-flight-check
description: "Query object field count and deleted fields before deploying new custom fields to prevent limit errors"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Field Limit Pre Flight Check

Query object field count and deleted fields before deploying new custom fields to prevent limit errors

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query object field count and deleted fields before deploying new custom fields to prevent limit errors
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 9c6df947-b337-45ed-bd87-7b3b2822ac3b
- **Agent**: manual-workflow
- **Enriched**: 2026-04-03
