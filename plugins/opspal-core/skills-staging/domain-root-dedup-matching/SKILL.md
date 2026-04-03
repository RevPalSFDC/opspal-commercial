---
name: domain-root-dedup-matching
description: "Strip industry suffixes (pm, mgmt, realty, properties, etc.) from domain base to find same-brand matches across different domain variations (e.g., [DOMAIN] / [DOMAIN] → 1stclass)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Domain Root Dedup Matching

Strip industry suffixes (pm, mgmt, realty, properties, etc.) from domain base to find same-brand matches across different domain variations (e.g., [DOMAIN] / [DOMAIN] → 1stclass)

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Strip industry suffixes (pm, mgmt, realty, properties, etc
2. ) from domain base to find same-brand matches across different domain variations (e
3. , [DOMAIN] / [DOMAIN] → 1stclass)

## Source

- **Reflection**: 867ce333-2b39-4add-a880-e1f432891258
- **Agent**: manual (dedup-accounts.py)
- **Enriched**: 2026-04-03
