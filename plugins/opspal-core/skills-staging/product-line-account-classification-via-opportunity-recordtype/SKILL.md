---
name: product-line-account-classification-via-opportunity-recordtype
description: "When accounts don't have product line fields, derive classification from [COMPANY] RecordType associations. Query all opps with target RecordType, extract unique AccountIds, build lookup map."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Product Line Account Classification Via Opportunity Recordtype

When accounts don't have product line fields, derive classification from [COMPANY] RecordType associations. Query all opps with target RecordType, extract unique AccountIds, build lookup map.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. When accounts don't have product line fields, derive classification from [COMPANY] RecordType associations
2. Query all opps with target RecordType, extract unique AccountIds, build lookup map

## Source

- **Reflection**: 7a1934fc-8f81-4071-a5df-a6736ee0ebcf
- **Agent**: manual
- **Enriched**: 2026-04-03
