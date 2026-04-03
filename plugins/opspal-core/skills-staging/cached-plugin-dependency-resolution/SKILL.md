---
name: cached-plugin-dependency-resolution
description: "When marketplace plugin installs lack node_modules, resolve dependencies from the cache directory at ~/.claude/plugins/cache/[marketplace]/[plugin]/[version]/node_modules by prepending to module.paths."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Cached Plugin Dependency Resolution

When marketplace plugin installs lack node_modules, resolve dependencies from the cache directory at ~/.claude/plugins/cache/[marketplace]/[plugin]/[version]/node_modules by prepending to module.paths.

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When marketplace plugin installs lack node_modules, resolve dependencies from the cache directory at ~/
2. claude/plugins/cache/[marketplace]/[plugin]/[version]/node_modules by prepending to module

## Source

- **Reflection**: 5afd35cd-d5ec-4733-b369-839edfe01f10
- **Agent**: manual investigation
- **Enriched**: 2026-04-03
