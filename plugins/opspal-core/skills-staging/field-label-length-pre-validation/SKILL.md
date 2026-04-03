---
name: field-label-length-pre-validation
description: "Before adding prefixes to field labels, calculate final length and identify fields that would exceed 40-character limit. Generate shortened alternatives that preserve prefix and meaningful label content."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Field Label Length Pre Validation

Before adding prefixes to field labels, calculate final length and identify fields that would exceed 40-character limit. Generate shortened alternatives that preserve prefix and meaningful label content.

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before adding prefixes to field labels, calculate final length and identify fields that would exceed 40-character limit
2. Generate shortened alternatives that preserve prefix and meaningful label content

## Source

- **Reflection**: 2431495d-04e1-4c93-83db-47e64e824eb5
- **Agent**: manual implementation
- **Enriched**: 2026-04-03
