---
name: post-error-confirmation
description: "After discovering an error, STOP and ask user before taking corrective action; verify current state before assuming remediation is needed"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Post Error Confirmation

After discovering an error, STOP and ask user before taking corrective action; verify current state before assuming remediation is needed

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. After discovering an error, STOP and ask user before taking corrective action
2. verify current state before assuming remediation is needed

## Source

- **Reflection**: c2843549-5a44-42f8-bf82-8ebf53df6592
- **Agent**: manual-observation
- **Enriched**: 2026-04-03
