---
name: auto-name-flow-truncation-guard
description: "When generating before-save flows that auto-populate Name fields, always wrap the formula in LEFT(..., maxLength) to prevent STRING_TOO_LONG errors"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:uat-orchestrator
---

# Auto Name Flow Truncation Guard

When generating before-save flows that auto-populate Name fields, always wrap the formula in LEFT(..., maxLength) to prevent STRING_TOO_LONG errors

## When to Use This Skill

- Before executing the operation described in this skill
- When encountering errors that match this pattern
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. When generating before-save flows that auto-populate Name fields, always wrap the formula in LEFT(
2. , maxLength) to prevent STRING_TOO_LONG errors

## Source

- **Reflection**: e9b4ca92-0569-49cc-a63d-307256b23f38
- **Agent**: opspal-core:uat-orchestrator
- **Enriched**: 2026-04-03
