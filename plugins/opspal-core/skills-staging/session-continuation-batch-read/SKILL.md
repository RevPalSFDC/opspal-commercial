---
name: session-continuation-batch-read
description: "When session is continued, pre-read all files that will be edited to restore context"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct execution
---

# Session Continuation Batch Read

When session is continued, pre-read all files that will be edited to restore context

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When session is continued, pre-read all files that will be edited to restore context
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 7ae2737d-8dac-4833-a983-3d6dbf457cd2
- **Agent**: direct execution
- **Enriched**: 2026-04-03
