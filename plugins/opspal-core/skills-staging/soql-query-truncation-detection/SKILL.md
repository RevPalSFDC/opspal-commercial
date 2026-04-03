---
name: soql-query-truncation-detection
description: "Always compare returned record count against totalSize to detect silent truncation at 50,000 record limit"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Soql Query Truncation Detection

Always compare returned record count against totalSize to detect silent truncation at 50,000 record limit

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Always compare returned record count against totalSize to detect silent truncation at 50,000 record limit
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 9cdc2870-e044-45ae-a1d5-1ed87e2ed541
- **Agent**: manual debugging
- **Enriched**: 2026-04-03
