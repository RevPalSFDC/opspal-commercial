---
name: hook-path-resolution-best-practice
description: "Hooks should use: ROOT=\\"$PWD\\" then call plugin scripts with absolute paths: node \\"$ROOT/plugins/[plugin]/scripts/lib/[script].js\\". Avoid hardcoding .claude/ paths that won't exist on fresh clones."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Hook Path Resolution Best Practice

Hooks should use: ROOT=\"$PWD\" then call plugin scripts with absolute paths: node \"$ROOT/plugins/[plugin]/scripts/lib/[script].js\". Avoid hardcoding .claude/ paths that won't exist on fresh clones.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: hook-development
**Discovered from**: reflection analysis

## Workflow

1. Hooks should use: ROOT=\"$PWD\" then call plugin scripts with absolute paths: node \"$ROOT/plugins/[plugin]/scripts/lib/[script]
2. Avoid hardcoding
3. claude/ paths that won't exist on fresh clones

## Source

- **Reflection**: 75877dc2-09ec-4791-bf47-a7376e704520
- **Agent**: unknown
- **Enriched**: 2026-04-03
