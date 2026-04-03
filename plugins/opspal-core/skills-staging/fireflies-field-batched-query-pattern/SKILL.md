---
name: fireflies-field-batched-query-pattern
description: "Split Fireflies GraphQL transcript queries into separate calls for metadata, summary, and sentences to avoid auth_failed errors"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Fireflies Field Batched Query Pattern

Split Fireflies GraphQL transcript queries into separate calls for metadata, summary, and sentences to avoid auth_failed errors

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Split Fireflies GraphQL transcript queries into separate calls for metadata, summary, and sentences to avoid auth_failed errors
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 113583e7-b858-4bd5-b55b-7882b5b19c9e
- **Agent**: manual (direct API calls)
- **Enriched**: 2026-04-03
