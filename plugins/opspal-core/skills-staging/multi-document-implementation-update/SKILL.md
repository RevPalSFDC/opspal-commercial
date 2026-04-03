---
name: multi-document-implementation-update
description: "After data migration work, update four documents in sequence: staging RUNBOOK (operational detail), SCHEMA_DOCUMENT (new fields), IMPLEMENTATION_PLAN (phase progress), DATA_MIGRATION_SCOPE (actual volumes vs estimates)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:solution-runbook-generator
---

# Multi Document Implementation Update

After data migration work, update four documents in sequence: staging RUNBOOK (operational detail), SCHEMA_DOCUMENT (new fields), IMPLEMENTATION_PLAN (phase progress), DATA_MIGRATION_SCOPE (actual volumes vs estimates)

## When to Use This Skill

- During data import or bulk operations

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: After data migration work, update four documents in sequence: staging RUNBOOK (operational detail), SCHEMA_DOCUMENT (new fields), IMPLEMENTATION_PLAN (phase progress), DATA_MIGRATION_SCOPE (actual volumes vs estimates)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 7f1a0bdf-4618-414a-aded-04f951aa9979
- **Agent**: solution-runbook-generator
- **Enriched**: 2026-04-03
