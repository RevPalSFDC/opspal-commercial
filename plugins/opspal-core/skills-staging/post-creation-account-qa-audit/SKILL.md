---
name: post-creation-account-qa-audit
description: "After batch Account creation, run naming convention audit + name-based dedup scan + RT picklist validation + demographic backfill from pre-existing records"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:general-purpose
---

# Post Creation Account Qa Audit

After batch Account creation, run naming convention audit + name-based dedup scan + RT picklist validation + demographic backfill from pre-existing records

## When to Use This Skill

- Before executing the operation described in this skill
- When performing audits or assessments of the target system

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: After batch Account creation, run naming convention audit + name-based dedup scan + RT picklist validation + demographic backfill from pre-existing records
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1d1712ec-dda1-4ca4-9f2c-d18eed00f7d8
- **Agent**: general-purpose
- **Enriched**: 2026-04-03
