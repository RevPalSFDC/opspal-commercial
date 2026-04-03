---
name: orphaned-flow-decision-detection
description: "Check Flow decision branches for null connectors that indicate incomplete logic paths"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-automation-auditor
---

# Orphaned Flow Decision Detection

Check Flow decision branches for null connectors that indicate incomplete logic paths

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Check Flow decision branches for null connectors that indicate incomplete logic paths
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: fa998934-2833-4908-ace4-ea9db50091db
- **Agent**: sfdc-automation-auditor
- **Enriched**: 2026-04-03
