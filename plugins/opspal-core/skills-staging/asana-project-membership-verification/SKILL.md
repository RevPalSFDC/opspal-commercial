---
name: asana-project-membership-verification
description: "After searching tasks with sections_any, always verify memberships.project.gid matches target project ID using get_multiple_tasks_by_gid with opt_fields=memberships.project.gid"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Asana Project Membership Verification

After searching tasks with sections_any, always verify memberships.project.gid matches target project ID using get_multiple_tasks_by_gid with opt_fields=memberships.project.gid

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. After searching tasks with sections_any, always verify memberships
2. gid matches target project ID using get_multiple_tasks_by_gid with opt_fields=memberships

## Source

- **Reflection**: add091ec-14c5-4802-8392-49565aed0261
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
