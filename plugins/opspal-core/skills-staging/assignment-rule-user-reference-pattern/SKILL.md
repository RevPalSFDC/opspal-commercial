---
name: assignment-rule-user-reference-pattern
description: "Assignment rules in metadata API require usernames ([EMAIL]) not User IDs (005xxx) for assignedTo field"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Assignment Rule User Reference Pattern

Assignment rules in metadata API require usernames ([EMAIL]) not User IDs (005xxx) for assignedTo field

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Assignment rules in metadata API require usernames ([EMAIL]) not User IDs (005xxx) for assignedTo field
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 10b55737-ca33-450b-b1c6-a27d443a5fa3
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
