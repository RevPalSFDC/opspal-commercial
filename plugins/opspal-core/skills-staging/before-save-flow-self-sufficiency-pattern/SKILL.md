---
name: before-save-flow-self-sufficiency-pattern
description: "When multiple Before Save flows run on the same object and one flow's logic depends on fields set by another, make each flow self-sufficient by including the dependent field assignments directly rather than relying on cross-flow IsChanged detection"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Before Save Flow Self Sufficiency Pattern

When multiple Before Save flows run on the same object and one flow's logic depends on fields set by another, make each flow self-sufficient by including the dependent field assignments directly rather than relying on cross-flow IsChanged detection

## When to Use This Skill

- Before executing the operation described in this skill
- When working with Salesforce Flows or automation

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When multiple Before Save flows run on the same object and one flow's logic depends on fields set by another, make each flow self-sufficient by including the dependent field assignments directly rather than relying on cross-flow IsChanged detection
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f53538aa-1cb4-4a66-bdd7-18501a339fdd
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
