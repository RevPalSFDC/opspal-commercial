---
name: toc-div-balance-verification
description: "Count <div and </div occurrences in generated TOC HTML, assert equality. If unbalanced, generate flat [COMPANY] without toc-group nesting."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Toc Div Balance Verification

Count <div and </div occurrences in generated TOC HTML, assert equality. If unbalanced, generate flat [COMPANY] without toc-group nesting.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Count <div and </div occurrences in generated TOC HTML, assert equality
2. If unbalanced, generate flat [COMPANY] without toc-group nesting

## Source

- **Reflection**: bbb1fe4c-3970-48dd-81c7-e75bf47dd25b
- **Agent**: manual (diagnostic script)
- **Enriched**: 2026-04-03
