---
name: command-to-script-resolution
description: "When slash command fails to execute, locate corresponding script via: find /[USER]/.claude/plugins -name '*<command-name>*'"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Command To Script Resolution

When slash command fails to execute, locate corresponding script via: find /[USER]/.claude/plugins -name '*<command-name>*'

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When slash command fails to execute, locate corresponding script via: find /[USER]/
2. claude/plugins -name '*<command-name>*'

## Source

- **Reflection**: bdcafca4-5a45-45b9-a46d-f8327321504e
- **Agent**: manual investigation
- **Enriched**: 2026-04-03
