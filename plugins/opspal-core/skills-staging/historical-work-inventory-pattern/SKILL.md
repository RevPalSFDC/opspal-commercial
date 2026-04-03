---
name: historical-work-inventory-pattern
description: "Use find command with -newermt date filter + session reflection JSON analysis + file timestamps to [SFDC_ID] inventory work performed on a specific date"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Historical Work Inventory Pattern

Use find command with -newermt date filter + session reflection JSON analysis + file timestamps to [SFDC_ID] inventory work performed on a specific date

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use find command with -newermt date filter + session reflection JSON analysis + file timestamps to [SFDC_ID] inventory work performed on a specific date
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 844fb789-9633-4de7-9f43-e86cd2ac2297
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
