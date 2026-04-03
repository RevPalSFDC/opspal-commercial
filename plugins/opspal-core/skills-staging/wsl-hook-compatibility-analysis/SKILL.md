---
name: wsl-hook-compatibility-analysis
description: "When hooks hang on WSL, check for: sync command, find operations on /tmp, cross-filesystem operations, and heavy I/O patterns"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Wsl Hook Compatibility Analysis

When hooks hang on WSL, check for: sync command, find operations on /tmp, cross-filesystem operations, and heavy I/O patterns

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When hooks hang on WSL, check for: sync command, find operations on /tmp, cross-filesystem operations, and heavy I/O patterns
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: d8ef01bb-bd7f-4c4a-8047-414ae8d59181
- **Agent**: manual-debugging
- **Enriched**: 2026-04-03
