---
name: scorecard-am-roster-diagnosis
description: "Check User.UserRole.Name against script filter when AM is missing from scorecard output"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct execution
---

# Scorecard Am Roster Diagnosis

Check User.UserRole.Name against script filter when AM is missing from scorecard output

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Check User.UserRole.Name against script filter when AM is missing from scorecard output
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4e7a734e-aabb-49e6-aa91-c21cccee66d3
- **Agent**: direct execution
- **Enriched**: 2026-04-03
