---
name: hook-duplicate-detection
description: "Compare plugin hooks.json definitions against compiled settings.json to find duplicates caused by cross-plugin relative paths and missing dedup canonicalization"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Hook Duplicate Detection

Compare plugin hooks.json definitions against compiled settings.json to find duplicates caused by cross-plugin relative paths and missing dedup canonicalization

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Compare plugin hooks
2. json definitions against compiled settings
3. json to find duplicates caused by cross-plugin relative paths and missing dedup canonicalization

## Source

- **Reflection**: ca976c78-b514-4aa7-8b4f-bd6b7b887c84
- **Agent**: manual-diagnostic
- **Enriched**: 2026-04-03
