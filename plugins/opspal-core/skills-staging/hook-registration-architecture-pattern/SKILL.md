---
name: hook-registration-architecture-pattern
description: "Plugin hooks defined in .claude-plugin/hooks.json must be manually merged into project .claude/settings.json with path resolution. Use ${CLAUDE_PLUGIN_ROOT} variable for portability."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Hook Registration Architecture Pattern

Plugin hooks defined in .claude-plugin/hooks.json must be manually merged into project .claude/settings.json with path resolution. Use ${CLAUDE_PLUGIN_ROOT} variable for portability.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: hook-development
**Discovered from**: reflection analysis

## Workflow

1. Plugin hooks defined in
2. claude-plugin/hooks
3. json must be manually merged into project
4. claude/settings
5. json with path resolution
6. Use ${CLAUDE_PLUGIN_ROOT} variable for portability

## Source

- **Reflection**: e19d25eb-d4de-4088-b99b-9cd70d4bdf38
- **Agent**: unknown
- **Enriched**: 2026-04-03
