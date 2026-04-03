---
name: parallel-role-hierarchy-creation
description: "Create new role branch in parallel to existing structure, then migrate users, then delete old branch"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-security-admin
---

# Parallel Role Hierarchy Creation

Create new role branch in parallel to existing structure, then migrate users, then delete old branch

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Create new role branch in parallel to existing structure, then migrate users, then delete old branch
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: dbe7e28c-b093-4174-b399-4b092896f6fe
- **Agent**: sfdc-security-admin
- **Enriched**: 2026-04-03
