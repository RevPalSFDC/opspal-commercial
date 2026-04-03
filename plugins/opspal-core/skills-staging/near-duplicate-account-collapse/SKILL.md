---
name: near-duplicate-account-collapse
description: "When multiple Accounts share the same domain and agency type (e.g., 'Columbus Police Department' vs 'Columbus Division of Police'), pick the one with standard naming and collapse contacts to it"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:orphan_contact_processor.py
---

# Near Duplicate Account Collapse

When multiple Accounts share the same domain and agency type (e.g., 'Columbus Police Department' vs 'Columbus Division of Police'), pick the one with standard naming and collapse contacts to it

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. When multiple Accounts share the same domain and agency type (e
2. , 'Columbus Police Department' vs 'Columbus Division of Police'), pick the one with standard naming and collapse contacts to it

## Source

- **Reflection**: 908e683b-796f-464a-9cf1-0479eef068a6
- **Agent**: orphan_contact_processor.py
- **Enriched**: 2026-04-03
