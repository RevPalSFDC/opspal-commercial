---
name: plugin-cache-audit
description: "Count versions per plugin in cache directory, check total size, identify the active version from plugin.json, and verify the agent-alias-resolver scans only the correct directory."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Plugin Cache Audit

Count versions per plugin in cache directory, check total size, identify the active version from plugin.json, and verify the agent-alias-resolver scans only the correct directory.

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Count versions per plugin in cache directory, check total size, identify the active version from plugin
2. json, and verify the agent-alias-resolver scans only the correct directory

## Source

- **Reflection**: dc0b262c-3623-4cb4-a162-79e067b72010
- **Agent**: manual analysis
- **Enriched**: 2026-04-03
