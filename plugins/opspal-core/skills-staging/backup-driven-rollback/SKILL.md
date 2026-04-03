---
name: backup-driven-rollback
description: "Use combination of (1) pre-existing backup CSV, (2) AccountHistory OldValue field, and (3) current state query to generate precise rollback script"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Backup Driven Rollback

Use combination of (1) pre-existing backup CSV, (2) AccountHistory OldValue field, and (3) current state query to generate precise rollback script

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use combination of (1) pre-existing backup CSV, (2) AccountHistory OldValue field, and (3) current state query to generate precise rollback script
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 97da66df-b184-4907-9c10-d3cd907b6d13
- **Agent**: manual-investigation
- **Enriched**: 2026-04-03
