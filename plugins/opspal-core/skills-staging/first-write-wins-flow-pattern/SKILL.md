---
name: first-write-wins-flow-pattern
description: "After-save flow that syncs child-to-parent field only when parent is blank. Uses Get Records + Decision (IsNull) + Update Records. Prevents overwrite on subsequent child updates."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-orchestrator
---

# First Write Wins Flow Pattern

After-save flow that syncs child-to-parent field only when parent is blank. Uses Get Records + Decision (IsNull) + Update Records. Prevents overwrite on subsequent child updates.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. After-save flow that syncs child-to-parent field only when parent is blank
2. Uses Get Records + Decision (IsNull) + Update Records
3. Prevents overwrite on subsequent child updates

## Source

- **Reflection**: daeff285-4154-4eda-8518-6a2caeb4971b
- **Agent**: sfdc-orchestrator
- **Enriched**: 2026-04-03
