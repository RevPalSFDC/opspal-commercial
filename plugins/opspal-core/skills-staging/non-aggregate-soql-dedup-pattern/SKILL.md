---
name: non-aggregate-soql-dedup-pattern
description: "For GROUP BY queries exceeding sf CLI batch limits (EXCEEDED_ID_LIMIT), switch to non-aggregate SELECT with [COMPANY] set() deduplication. Avoids queryMore() limitation on aggregate queries."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Non Aggregate Soql Dedup Pattern

For GROUP BY queries exceeding sf CLI batch limits (EXCEEDED_ID_LIMIT), switch to non-aggregate SELECT with [COMPANY] set() deduplication. Avoids queryMore() limitation on aggregate queries.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. For GROUP BY queries exceeding sf CLI batch limits (EXCEEDED_ID_LIMIT), switch to non-aggregate SELECT with [COMPANY] set() deduplication
2. Avoids queryMore() limitation on aggregate queries

## Source

- **Reflection**: 7a1934fc-8f81-4071-a5df-a6736ee0ebcf
- **Agent**: manual
- **Enriched**: 2026-04-03
