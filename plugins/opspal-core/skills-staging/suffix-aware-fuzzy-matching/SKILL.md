---
name: suffix-aware-fuzzy-matching
description: "Strip common domain suffixes (Correctional Facility, Correctional Center, Prison, etc.) before fuzzy comparison to prevent false positives"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Suffix Aware Fuzzy Matching

Strip common domain suffixes (Correctional Facility, Correctional Center, Prison, etc.) before fuzzy comparison to prevent false positives

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Strip common domain suffixes (Correctional Facility, Correctional Center, Prison, etc
2. ) before fuzzy comparison to prevent false positives

## Source

- **Reflection**: be82bdb1-3ce3-45c0-8b0d-446667672ccb
- **Agent**: manual-implementation
- **Enriched**: 2026-04-03
