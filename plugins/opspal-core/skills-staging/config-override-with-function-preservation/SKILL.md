---
name: config-override-with-function-preservation
description: "When merging config JSON into code-defined objects with functions, explicitly preserve function properties instead of blind object spread. Only override scalar values from config."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Config Override With Function Preservation

When merging config JSON into code-defined objects with functions, explicitly preserve function properties instead of blind object spread. Only override scalar values from config.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: script-development
**Discovered from**: reflection analysis

## Workflow

1. When merging config JSON into code-defined objects with functions, explicitly preserve function properties instead of blind object spread
2. Only override scalar values from config

## Source

- **Reflection**: 0dfa30e2-4e43-47ef-8e94-f6aee443f94a
- **Agent**: unknown
- **Enriched**: 2026-04-03
