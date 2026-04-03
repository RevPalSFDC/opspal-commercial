---
name: hook-error-diagnosis-via-debug-log
description: "Enable /debug, reproduce the issue, then grep for 'error:' in the debug log to identify which hook is failing and see its stderr output"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Hook Error Diagnosis Via Debug Log

Enable /debug, reproduce the issue, then grep for 'error:' in the debug log to identify which hook is failing and see its stderr output

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Enable /debug, reproduce the issue, then grep for 'error:' in the debug log to identify which hook is failing and see its stderr output
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 95fc7e62-3f77-4b44-98c0-23517b15afe3
- **Agent**: manual diagnosis
- **Enriched**: 2026-04-03
