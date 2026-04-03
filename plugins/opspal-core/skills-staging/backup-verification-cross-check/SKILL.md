---
name: backup-verification-cross-check
description: "Before deletion, sample deletion candidate IDs and verify they exist in backup file"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Backup Verification Cross Check

Before deletion, sample deletion candidate IDs and verify they exist in backup file

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before deletion, sample deletion candidate IDs and verify they exist in backup file
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a2f870b1-8f3e-482c-bc49-1d77364c29e3
- **Agent**: manual workflow
- **Enriched**: 2026-04-03
