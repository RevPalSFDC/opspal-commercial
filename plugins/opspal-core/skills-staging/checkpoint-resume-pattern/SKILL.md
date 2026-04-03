---
name: checkpoint-resume-pattern
description: "Save progress to JSON checkpoint every N operations with atomic writes, support resume by loading checkpoint on startup and skipping already-processed items"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Checkpoint Resume Pattern

Save progress to JSON checkpoint every N operations with atomic writes, support resume by loading checkpoint on startup and skipping already-processed items

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Save progress to JSON checkpoint every N operations with atomic writes, support resume by loading checkpoint on startup and skipping already-processed items
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 30710207-0c67-4935-a042-a8fa708d867e
- **Agent**: manual (Python script)
- **Enriched**: 2026-04-03
