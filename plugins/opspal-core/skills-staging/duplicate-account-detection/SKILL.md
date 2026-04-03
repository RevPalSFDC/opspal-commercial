---
name: duplicate-account-detection
description: "Identify potential duplicate accounts by matching on name patterns, abbreviations, and domain overlap"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-query-specialist
---

# Duplicate Account Detection

Identify potential duplicate accounts by matching on name patterns, abbreviations, and domain overlap

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Identify potential duplicate accounts by matching on name patterns, abbreviations, and domain overlap
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 76905101-8a0f-4c80-a562-284294c3acf0
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
