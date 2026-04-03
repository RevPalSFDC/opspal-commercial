---
name: inline-find-path-resolution
description: "Use node \\"$(find . -name 'script.js' -path '*pattern*' | head -1)\\" for portable script execution across different installation contexts"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Inline Find Path Resolution

Use node \"$(find . -name 'script.js' -path '*pattern*' | head -1)\" for portable script execution across different installation contexts

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Use node \"$(find
2. -name 'script
3. js' -path '*pattern*' | head -1)\" for portable script execution across different installation contexts

## Source

- **Reflection**: e589c70d-c108-4140-b208-6f9bdf45d991
- **Agent**: manual implementation
- **Enriched**: 2026-04-03
