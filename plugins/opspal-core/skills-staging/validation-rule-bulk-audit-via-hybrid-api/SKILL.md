---
name: validation-rule-bulk-audit-via-hybrid-api
description: "Use Tooling API for inventory enumeration (names, active status, error messages), then Metadata API via parent CustomObject retrieval for formulas. Cross-check counts. Parse XML with [COMPANY] for structured analysis."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Validation Rule Bulk Audit Via Hybrid Api

Use Tooling API for inventory enumeration (names, active status, error messages), then Metadata API via parent CustomObject retrieval for formulas. Cross-check counts. Parse XML with [COMPANY] for structured analysis.

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Use Tooling API for inventory enumeration (names, active status, error messages), then Metadata API via parent CustomObject retrieval for formulas
2. Cross-check counts
3. Parse XML with [COMPANY] for structured analysis

## Source

- **Reflection**: ca07b808-e447-41bf-8d57-ffcc09aac31e
- **Agent**: manual (no agent used)
- **Enriched**: 2026-04-03
