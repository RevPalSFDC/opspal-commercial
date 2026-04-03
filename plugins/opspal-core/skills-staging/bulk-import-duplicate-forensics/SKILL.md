---
name: bulk-import-duplicate-forensics
description: "Grep bulk job result CSVs for DUPLICATES_DETECTED errors to identify which records were blocked vs allowed through, then query org for actual duplicates created"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Bulk Import Duplicate Forensics

Grep bulk job result CSVs for DUPLICATES_DETECTED errors to identify which records were blocked vs allowed through, then query org for actual duplicates created

## When to Use This Skill

- During data import or bulk operations
- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Grep bulk job result CSVs for DUPLICATES_DETECTED errors to identify which records were blocked vs allowed through, then query org for actual duplicates created
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 844fb789-9633-4de7-9f43-e86cd2ac2297
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
