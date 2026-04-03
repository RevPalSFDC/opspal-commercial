---
name: data-source-completeness-validation
description: "Compare client-provided export record count against live database count before analysis"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Data Source Completeness Validation

Compare client-provided export record count against live database count before analysis

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Compare client-provided export record count against live database count before analysis
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 79cc4fad-10ad-45fa-803a-26684f4bcb8a
- **Agent**: manual implementation
- **Enriched**: 2026-04-03
