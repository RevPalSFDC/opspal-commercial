---
name: duplicate-key-resolution-by-score
description: "When multiple records share a unique key, retain record with highest match/confidence score"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:Manual Python script
---

# Duplicate Key Resolution By Score

When multiple records share a unique key, retain record with highest match/confidence score

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When multiple records share a unique key, retain record with highest match/confidence score
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 6047c752-6c35-4de0-af0a-2a5d3647c0af
- **Agent**: Manual Python script
- **Enriched**: 2026-04-03
