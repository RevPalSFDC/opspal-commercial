---
name: non-existent-object-research-pattern
description: "When Salesforce documentation URL references non-existent object, create research findings document with: (1) verification attempts, (2) alternative objects that DO exist, (3) code examples using alternatives, (4) explanation of why object doesn't exist"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:playwright-browser-controller
---

# Non Existent Object Research Pattern

When Salesforce documentation URL references non-existent object, create research findings document with: (1) verification attempts, (2) alternative objects that DO exist, (3) code examples using alternatives, (4) explanation of why object doesn't exist

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When Salesforce documentation URL references non-existent object, create research findings document with: (1) verification attempts, (2) alternative objects that DO exist, (3) code examples using alternatives, (4) explanation of why object doesn't exist
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c5aaa5ed-d561-4587-bfb2-6bc761b8c2bf
- **Agent**: playwright-browser-controller
- **Enriched**: 2026-04-03
