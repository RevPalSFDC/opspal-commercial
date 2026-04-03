---
name: settings-file-recovery
description: "Use Grep to find malformed entries by searching for unique tokens (__NEW_LINE_, EOF), then surgically remove with Edit tool while preserving valid entries"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Settings File Recovery

Use Grep to find malformed entries by searching for unique tokens (__NEW_LINE_, EOF), then surgically remove with Edit tool while preserving valid entries

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use Grep to find malformed entries by searching for unique tokens (__NEW_LINE_, EOF), then surgically remove with Edit tool while preserving valid entries
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 92196935-86f7-48bc-b477-029338e775c9
- **Agent**: manual
- **Enriched**: 2026-04-03
