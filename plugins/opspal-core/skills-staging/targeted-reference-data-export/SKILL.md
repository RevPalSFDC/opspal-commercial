---
name: targeted-reference-data-export
description: "For large orgs (>[N] records), use targeted queries (email IN, LastName IN, Name IN) instead of broad state-based exports. Pre-flight field population check determines strategy."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Targeted Reference Data Export

For large orgs (>[N] records), use targeted queries (email IN, LastName IN, Name IN) instead of broad state-based exports. Pre-flight field population check determines strategy.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. For large orgs (>[N] records), use targeted queries (email IN, LastName IN, Name IN) instead of broad state-based exports
2. Pre-flight field population check determines strategy

## Source

- **Reflection**: 94eec466-4e6e-4bae-beff-88fee2a5368b
- **Agent**: manual (export_targeted.py)
- **Enriched**: 2026-04-03
