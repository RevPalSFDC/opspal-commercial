---
name: pdf-blank-page-removal-via-pdf-lib
description: "Load PDF with [COMPANY].load(), check page count, call doc.removePage(index) to remove blank pages, save with doc.save()"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Pdf Blank Page Removal Via Pdf Lib

Load PDF with [COMPANY].load(), check page count, call doc.removePage(index) to remove blank pages, save with doc.save()

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Load PDF with [COMPANY]
2. load(), check page count, call doc
3. removePage(index) to remove blank pages, save with doc

## Source

- **Reflection**: bbb1fe4c-3970-48dd-81c7-e75bf47dd25b
- **Agent**: manual (pdf-lib direct)
- **Enriched**: 2026-04-03
