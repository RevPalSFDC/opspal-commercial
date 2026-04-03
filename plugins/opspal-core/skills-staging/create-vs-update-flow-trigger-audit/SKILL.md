---
name: create-vs-update-flow-trigger-audit
description: "Validate that required derived-field Flows fire on both record creation and qualifying updates before release signoff."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:qa-execute
---

# Create Vs Update Flow Trigger Audit

Validate that required derived-field Flows fire on both record creation and qualifying updates before release signoff.

## When to Use This Skill

- Before executing the operation described in this skill
- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Validate that required derived-field Flows fire on both record creation and qualifying updates before release signoff.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a13ec5ab-50f9-42b4-8eba-3a8cfc8d7a27
- **Agent**: qa-execute
- **Enriched**: 2026-04-03
