---
name: blankvalue-case-optimization
description: "Use BLANKVALUE(CASE(..., NULL), fallback) instead of IF(NOT(ISBLANK(CASE(...))), CASE(...), fallback) to avoid duplicating CASE blocks in formula fields"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct
---

# Blankvalue Case Optimization

Use BLANKVALUE(CASE(..., NULL), fallback) instead of IF(NOT(ISBLANK(CASE(...))), CASE(...), fallback) to avoid duplicating CASE blocks in formula fields

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Use BLANKVALUE(CASE(
2. , NULL), fallback) instead of IF(NOT(ISBLANK(CASE(
3. ), fallback) to avoid duplicating CASE blocks in formula fields

## Source

- **Reflection**: 49a4e8e1-0d2a-4263-aa62-21e438e74334
- **Agent**: direct
- **Enriched**: 2026-04-03
