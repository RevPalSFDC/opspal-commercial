---
name: command-vs-agent-detection
description: "Scan commands/ directories to build registry, check against registry before Task tool invocation, return helpful error with correct invocation method"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:pre-task-agent-validator.sh
---

# Command Vs Agent Detection

Scan commands/ directories to build registry, check against registry before Task tool invocation, return helpful error with correct invocation method

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Scan commands/ directories to build registry, check against registry before Task tool invocation, return helpful error with correct invocation method
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 70d7ef68-226e-4959-a78c-6d2436b3e8da
- **Agent**: pre-task-agent-validator.sh
- **Enriched**: 2026-04-03
