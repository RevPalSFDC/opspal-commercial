---
name: before-save-and-screen-flow-coordination
description: "Use bypass checkbox field that Screen Flow sets before update, Before-Save flow checks and skips if set"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-implementation
---

# Before Save And Screen Flow Coordination

Use bypass checkbox field that Screen Flow sets before update, Before-Save flow checks and skips if set

## When to Use This Skill

- Before executing the operation described in this skill
- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use bypass checkbox field that Screen Flow sets before update, Before-Save flow checks and skips if set
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4f74cf66-b547-4c2b-8d93-a224b20d5b6f
- **Agent**: direct-implementation
- **Enriched**: 2026-04-03
