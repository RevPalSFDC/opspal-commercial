---
name: website-url-normalization-for-dedup
description: "Before duplicate matching, normalize website URLs by stripping https://, http://, www. prefixes and trailing slashes to catch duplicates with minor formatting differences"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Website Url Normalization For Dedup

Before duplicate matching, normalize website URLs by stripping https://, http://, www. prefixes and trailing slashes to catch duplicates with minor formatting differences

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Before duplicate matching, normalize website URLs by stripping https://, http://, www
2. prefixes and trailing slashes to catch duplicates with minor formatting differences

## Source

- **Reflection**: 844fb789-9633-4de7-9f43-e86cd2ac2297
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
