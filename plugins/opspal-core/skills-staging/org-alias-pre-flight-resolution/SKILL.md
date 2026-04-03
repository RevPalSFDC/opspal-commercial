---
name: org-alias-pre-flight-resolution
description: "Before spawning any SF-facing sub-agent, resolve the correct SF CLI alias from `sf org list` rather than inferring from config files"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:operator (learned from failure)
---

# Org Alias Pre Flight Resolution

Before spawning any SF-facing sub-agent, resolve the correct SF CLI alias from `sf org list` rather than inferring from config files

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before spawning any SF-facing sub-agent, resolve the correct SF CLI alias from `sf org list` rather than inferring from config files
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e26f607a-e89e-4e8a-bf73-05763da9755d
- **Agent**: operator (learned from failure)
- **Enriched**: 2026-04-03
