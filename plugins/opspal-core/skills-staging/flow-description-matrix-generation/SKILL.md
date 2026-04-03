---
name: flow-description-matrix-generation
description: "Use Grep with <description> pattern on flow XML files to extract all flow descriptions, then format into categorized matrix table"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:claude-code-session
---

# Flow Description Matrix Generation

Use Grep with <description> pattern on flow XML files to extract all flow descriptions, then format into categorized matrix table

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: documentation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use Grep with <description> pattern on flow XML files to extract all flow descriptions, then format into categorized matrix table
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: bc7f2a95-8725-4027-9db4-fb083f8ee91f
- **Agent**: claude-code-session
- **Enriched**: 2026-04-03
