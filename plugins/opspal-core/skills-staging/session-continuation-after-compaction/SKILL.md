---
name: session-continuation-after-compaction
description: "Read session summary, identify pending task, continue execution without re-prompting user"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Session Continuation After Compaction

Read session summary, identify pending task, continue execution without re-prompting user

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Read session summary, identify pending task, continue execution without re-prompting user
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e156d7d2-87f2-4c89-92e1-0616d88716f8
- **Agent**: manual
- **Enriched**: 2026-04-03
