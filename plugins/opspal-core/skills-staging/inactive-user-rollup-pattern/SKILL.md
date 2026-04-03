---
name: inactive-user-rollup-pattern
description: "Query User.IsActive for all Account Owners, consolidate inactive users into a single 'Unassigned' bucket with documentation of who was rolled up"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Inactive User Rollup Pattern

Query User.IsActive for all Account Owners, consolidate inactive users into a single 'Unassigned' bucket with documentation of who was rolled up

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: data-quality
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query User.IsActive for all Account Owners, consolidate inactive users into a single 'Unassigned' bucket with documentation of who was rolled up
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 9030650d-f8ea-48c0-95c7-f5f780eb32f3
- **Agent**: manual workflow with sfdc-query-specialist
- **Enriched**: 2026-04-03
