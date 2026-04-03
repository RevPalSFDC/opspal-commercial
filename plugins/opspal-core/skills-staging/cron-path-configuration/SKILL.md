---
name: cron-path-configuration
description: "Export full PATH including nvm/node directories at start of cron runner scripts"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:Direct implementation
---

# Cron Path Configuration

Export full PATH including nvm/node directories at start of cron runner scripts

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Export full PATH including nvm/node directories at start of cron runner scripts
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 90432622-ab93-4c17-841d-6a3561221be2
- **Agent**: Direct implementation
- **Enriched**: 2026-04-03
