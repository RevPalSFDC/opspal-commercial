---
name: false-positive-filtering-in-name-based-queries
description: "When querying by name pattern (e.g., '%Fire%'), identify and exclude false positives like 'Firearms Office' that match pattern but don't belong to target category"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-execution
---

# False Positive Filtering In Name Based Queries

When querying by name pattern (e.g., '%Fire%'), identify and exclude false positives like 'Firearms Office' that match pattern but don't belong to target category

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. When querying by name pattern (e
2. , '%Fire%'), identify and exclude false positives like 'Firearms Office' that match pattern but don't belong to target category

## Source

- **Reflection**: d1888d51-8ffc-46d2-a711-0cc203aaa474
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
