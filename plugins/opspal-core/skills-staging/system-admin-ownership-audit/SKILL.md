---
name: system-admin-ownership-audit
description: "Query System Administrator profile users and identify owned accounts that should be reassigned to territory reps"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# System Admin Ownership Audit

Query System Administrator profile users and identify owned accounts that should be reassigned to territory reps

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query System Administrator profile users and identify owned accounts that should be reassigned to territory reps
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2377bea1-0b4a-423c-b5a4-04b1fe9abb88
- **Agent**: manual query building
- **Enriched**: 2026-04-03
