---
name: description-append-safe-pattern
description: "Remove Description from initial upload CSVs. After insert/update, query existing Descriptions, append new text with separator, upload as separate CLEANUP job."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Description Append Safe Pattern

Remove Description from initial upload CSVs. After insert/update, query existing Descriptions, append new text with separator, upload as separate CLEANUP job.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Remove Description from initial upload CSVs
2. After insert/update, query existing Descriptions, append new text with separator, upload as separate CLEANUP job

## Source

- **Reflection**: 6181da08-9c5b-4d95-98df-70790dcdcbc7
- **Agent**: manual
- **Enriched**: 2026-04-03
