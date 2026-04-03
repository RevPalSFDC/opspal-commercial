---
name: territory-documentation-verification
description: "Always query SFDC directly (Territory2, ObjectTerritory2Association, ObjectTerritory2AssignmentRule) before updating territory documentation to ensure DeveloperNames and account counts are accurate"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Territory Documentation Verification

Always query SFDC directly (Territory2, ObjectTerritory2Association, ObjectTerritory2AssignmentRule) before updating territory documentation to ensure DeveloperNames and account counts are accurate

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Always query SFDC directly (Territory2, ObjectTerritory2Association, ObjectTerritory2AssignmentRule) before updating territory documentation to ensure DeveloperNames and account counts are accurate
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 11c59478-f6c6-48f2-8a4f-808e6e365694
- **Agent**: manual execution
- **Enriched**: 2026-04-03
