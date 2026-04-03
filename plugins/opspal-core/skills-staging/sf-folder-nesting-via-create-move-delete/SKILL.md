---
name: sf-folder-nesting-via-create-move-delete
description: "Create child folders under parent via POST with parentId, move reports via Analytics API PATCH folderId, delete old empty folders, redeploy dashboards with new folder devnames"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Sf Folder Nesting Via Create Move Delete

Create child folders under parent via POST with parentId, move reports via Analytics API PATCH folderId, delete old empty folders, redeploy dashboards with new folder devnames

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When building or modifying reports and dashboards

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Create child folders under parent via POST with parentId, move reports via Analytics API PATCH folderId, delete old empty folders, redeploy dashboards with new folder devnames
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 64f2ff47-b299-4565-835e-758da156ca44
- **Agent**: direct execution
- **Enriched**: 2026-04-03
