---
name: plugin-infrastructure-script-migration
description: "When creating infrastructure scripts, start in .claude/ for rapid prototyping, then migrate to plugins/[plugin]/scripts/lib/ for version control. Update all references (hooks, skills, commands) to use plugin-relative paths."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Plugin Infrastructure Script Migration

When creating infrastructure scripts, start in .claude/ for rapid prototyping, then migrate to plugins/[plugin]/scripts/lib/ for version control. Update all references (hooks, skills, commands) to use plugin-relative paths.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: script-development
**Discovered from**: reflection analysis

## Workflow

1. When creating infrastructure scripts, start in
2. claude/ for rapid prototyping, then migrate to plugins/[plugin]/scripts/lib/ for version control
3. Update all references (hooks, skills, commands) to use plugin-relative paths

## Source

- **Reflection**: 75877dc2-09ec-4791-bf47-a7376e704520
- **Agent**: unknown
- **Enriched**: 2026-04-03
