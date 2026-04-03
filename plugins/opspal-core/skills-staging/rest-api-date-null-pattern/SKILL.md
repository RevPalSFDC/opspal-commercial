---
name: rest-api-date-null-pattern
description: "Use curl -X PATCH with explicit null JSON values to clear Date/DateTime fields on Salesforce records when sf CLI fails"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Rest Api Date Null Pattern

Use curl -X PATCH with explicit null JSON values to clear Date/DateTime fields on Salesforce records when sf CLI fails

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use curl -X PATCH with explicit null JSON values to clear Date/DateTime fields on Salesforce records when sf CLI fails
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c2bc18b5-f055-4cb1-9654-560c22a283c0
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
