---
name: territory-rule-bulk-deactivation
description: "Query ObjectTerritory2AssignmentRule by DeveloperName LIKE pattern, then update IsActive=false for all matching records"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Territory Rule Bulk Deactivation

Query ObjectTerritory2AssignmentRule by DeveloperName LIKE pattern, then update IsActive=false for all matching records

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query ObjectTerritory2AssignmentRule by DeveloperName LIKE pattern, then update IsActive=false for all matching records
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 5ef234cc-8119-49b8-a072-e520d3c6faf7
- **Agent**: manual execution
- **Enriched**: 2026-04-03
