---
name: tolerance-based-error-analysis
description: "After initial reconciliation, apply user-defined tolerances (date proximity, convention-only changes) to distinguish material errors from acceptable variance. Use regex-based FY/year extraction to detect semantic mismatches within name fields."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:lead agent (direct execution)
---

# Tolerance Based Error Analysis

After initial reconciliation, apply user-defined tolerances (date proximity, convention-only changes) to distinguish material errors from acceptable variance. Use regex-based FY/year extraction to detect semantic mismatches within name fields.

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. After initial reconciliation, apply user-defined tolerances (date proximity, convention-only changes) to distinguish material errors from acceptable variance
2. Use regex-based FY/year extraction to detect semantic mismatches within name fields

## Source

- **Reflection**: 2db11bc7-2a79-419d-bfe3-08f63659f4c8
- **Agent**: lead agent (direct execution)
- **Enriched**: 2026-04-03
