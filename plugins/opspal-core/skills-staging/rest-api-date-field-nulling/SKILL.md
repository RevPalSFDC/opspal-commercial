---
name: rest-api-date-field-nulling
description: "Use sf api request rest --method PATCH with [COMPANY] body containing explicit null for date fields, since sf data update record --values cannot handle null dates."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Rest Api Date Field Nulling

Use sf api request rest --method PATCH with [COMPANY] body containing explicit null for date fields, since sf data update record --values cannot handle null dates.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use sf api request rest --method PATCH with [COMPANY] body containing explicit null for date fields, since sf data update record --values cannot handle null dates.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: d3d39d23-1af6-41a4-82d9-94ca87a6a34e
- **Agent**: manual
- **Enriched**: 2026-04-03
