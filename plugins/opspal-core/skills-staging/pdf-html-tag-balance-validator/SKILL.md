---
name: pdf-html-tag-balance-validator
description: "Count open/close div tags in generated TOC/cover HTML before passing to md-to-pdf renderer. Prevents styling leaks from unclosed containers."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Pdf Html Tag Balance Validator

Count open/close div tags in generated TOC/cover HTML before passing to md-to-pdf renderer. Prevents styling leaks from unclosed containers.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Count open/close div tags in generated TOC/cover HTML before passing to md-to-pdf renderer
2. Prevents styling leaks from unclosed containers

## Source

- **Reflection**: 736442a7-880c-4589-99e4-d5163b655b33
- **Agent**: manual debugging
- **Enriched**: 2026-04-03
