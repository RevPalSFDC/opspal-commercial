---
name: territory-gap-remediation-via-manual-ota-+-sync-handler
description: "When accounts lack LE territory assignments (only DS/FM/SGA), create Manual OTA records pointing to geographically appropriate LE territory, then invoke PrimaryTerritorySyncHandler.syncAccountTerritories() to stamp all fields."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Territory Gap Remediation Via Manual Ota + Sync Handler

When accounts lack LE territory assignments (only DS/FM/SGA), create Manual OTA records pointing to geographically appropriate LE territory, then invoke PrimaryTerritorySyncHandler.syncAccountTerritories() to stamp all fields.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When accounts lack LE territory assignments (only DS/FM/SGA), create Manual OTA records pointing to geographically appropriate LE territory, then invoke PrimaryTerritorySyncHandler
2. syncAccountTerritories() to stamp all fields

## Source

- **Reflection**: 95be29d1-e682-4ca3-834a-8148a6df0a6b
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
