---
name: plugin-cache-path-discovery
description: "When commands fail with [COMPANY]_NOT_FOUND, glob for the script in ~/.claude/plugins/cache/ and ~/.claude/plugins/marketplaces/ to find the actual installation path"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Plugin Cache Path Discovery

When commands fail with [COMPANY]_NOT_FOUND, glob for the script in ~/.claude/plugins/cache/ and ~/.claude/plugins/marketplaces/ to find the actual installation path

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When commands fail with [COMPANY]_NOT_FOUND, glob for the script in ~/
2. claude/plugins/cache/ and ~/
3. claude/plugins/marketplaces/ to find the actual installation path

## Source

- **Reflection**: 95fc7e62-3f77-4b44-98c0-23517b15afe3
- **Agent**: manual diagnosis
- **Enriched**: 2026-04-03
