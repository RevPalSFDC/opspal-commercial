---
name: accounthistory-dual-record-filtering
description: "AccountHistory Owner changes create paired records (User IDs + display names). Filter to User ID records only using regex ^005[a-zA-Z0-9]{12,15}$ pattern."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Accounthistory Dual Record Filtering

AccountHistory Owner changes create paired records (User IDs + display names). Filter to User ID records only using regex ^005[a-zA-Z0-9]{12,15}$ pattern.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. AccountHistory Owner changes create paired records (User IDs + display names)
2. Filter to User ID records only using regex ^005[a-zA-Z0-9]{12,15}$ pattern

## Source

- **Reflection**: b7cc6fb3-ce84-46ad-94a7-98519b3e75c6
- **Agent**: manual
- **Enriched**: 2026-04-03
