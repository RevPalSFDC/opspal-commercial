---
name: cross-platform-integration-status-check
description: "When field population issues occur, check if external system (HubSpot, Marketo) might be expected source"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-field-analyzer
---

# Cross Platform Integration Status Check

When field population issues occur, check if external system (HubSpot, Marketo) might be expected source

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When field population issues occur, check if external system (HubSpot, Marketo) might be expected source
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: fa998934-2833-4908-ace4-ea9db50091db
- **Agent**: sfdc-field-analyzer
- **Enriched**: 2026-04-03
