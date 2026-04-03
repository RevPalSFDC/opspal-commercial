---
name: ownership-change-verification
description: "Calculate MD5 hash of sorted OwnerId column before and after changes to verify no unintended modifications"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Ownership Change Verification

Calculate MD5 hash of sorted OwnerId column before and after changes to verify no unintended modifications

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Calculate MD5 hash of sorted OwnerId column before and after changes to verify no unintended modifications
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: dbe7e28c-b093-4174-b399-4b092896f6fe
- **Agent**: manual execution
- **Enriched**: 2026-04-03
