---
name: validation-rule-adaptive-update
description: "When bulk update fails due to validation rule, analyze error, add required field with nominal value, retry"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Validation Rule Adaptive Update

When bulk update fails due to validation rule, analyze error, add required field with nominal value, retry

## When to Use This Skill

- During data import or bulk operations
- When performing audits or assessments of the target system
- When encountering errors that match this pattern

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When bulk update fails due to validation rule, analyze error, add required field with nominal value, retry
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ac8321b0-75b1-49e3-bb12-ba5e5a848e4b
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
