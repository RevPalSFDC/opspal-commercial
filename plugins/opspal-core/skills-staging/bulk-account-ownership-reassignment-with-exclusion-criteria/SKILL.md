---
name: bulk-account-ownership-reassignment-with-exclusion-criteria
description: "Read source list, categorize by exclusion criteria (Fire/Corrections/dupes), confirm edge cases with user, execute parallel sf data update record calls, verify with SOQL"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-execution
---

# Bulk Account Ownership Reassignment With Exclusion Criteria

Read source list, categorize by exclusion criteria (Fire/Corrections/dupes), confirm edge cases with user, execute parallel sf data update record calls, verify with SOQL

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Read source list, categorize by exclusion criteria (Fire/Corrections/dupes), confirm edge cases with user, execute parallel sf data update record calls, verify with SOQL
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ac483c65-1c86-441b-a9ad-9499303d62c7
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
