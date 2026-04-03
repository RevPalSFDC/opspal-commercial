---
name: entity-name-keyword-override
description: "When Industry assignment based on keywords (University→Higher Education), check for override keywords (Hospital, Medical Center→Healthcare) that should take precedence"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Entity Name Keyword Override

When Industry assignment based on keywords (University→Higher Education), check for override keywords (Hospital, Medical Center→Healthcare) that should take precedence

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When Industry assignment based on keywords (University→Higher Education), check for override keywords (Hospital, Medical Center→Healthcare) that should take precedence
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 728fd241-d396-4d87-ba69-d8c2e0ffb41b
- **Agent**: manual workflow
- **Enriched**: 2026-04-03
