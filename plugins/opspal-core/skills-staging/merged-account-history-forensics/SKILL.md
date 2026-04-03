---
name: merged-account-history-forensics
description: "Use --all-rows flag when querying *History objects for merged/deleted records. Combine survivor + non-survivor timelines. Resolve user IDs. Cross-reference with pre-merge backups."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct execution
---

# Merged Account History Forensics

Use --all-rows flag when querying *History objects for merged/deleted records. Combine survivor + non-survivor timelines. Resolve user IDs. Cross-reference with pre-merge backups.

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Use --all-rows flag when querying *History objects for merged/deleted records
2. Combine survivor + non-survivor timelines
3. Resolve user IDs
4. Cross-reference with pre-merge backups

## Source

- **Reflection**: 9039b0bf-1783-40f6-87d1-fd3a88a6a5e9
- **Agent**: direct execution
- **Enriched**: 2026-04-03
