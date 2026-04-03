---
name: pdf-layout-forensics
description: "Use pymupdf to extract text per page, then render intermediate HTML via marked.parse to inspect DOM structure at [COMPANY] transition points. Trace CSS cascade across all 6 stylesheet layers."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Pdf Layout Forensics

Use pymupdf to extract text per page, then render intermediate HTML via marked.parse to inspect DOM structure at [COMPANY] transition points. Trace CSS cascade across all 6 stylesheet layers.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Use pymupdf to extract text per page, then render intermediate HTML via marked
2. parse to inspect DOM structure at [COMPANY] transition points
3. Trace CSS cascade across all 6 stylesheet layers

## Source

- **Reflection**: 636b402d-e097-4412-9055-7c7ef014b39e
- **Agent**: manual debugging
- **Enriched**: 2026-04-03
