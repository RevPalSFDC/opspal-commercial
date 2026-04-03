---
name: account-name-city-extraction
description: "Regex patterns to extract city from standardized account names like 'FL: [City] Police Department'"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Account Name City Extraction

Regex patterns to extract city from standardized account names like 'FL: [City] Police Department'

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Regex patterns to extract city from standardized account names like 'FL: [City] Police Department'
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 74f3b4fe-ea41-4140-9f5f-9cdc28dab347
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
