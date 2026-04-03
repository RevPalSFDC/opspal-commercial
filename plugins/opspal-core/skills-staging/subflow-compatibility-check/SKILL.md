---
name: subflow-compatibility-check
description: "Query [SFDC_ID].TriggerType before updating subflow references - null means callable, non-null means record-triggered (not callable)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Subflow Compatibility Check

Query [SFDC_ID].TriggerType before updating subflow references - null means callable, non-null means record-triggered (not callable)

## When to Use This Skill

- Before executing the operation described in this skill
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Query [SFDC_ID]
2. TriggerType before updating subflow references - null means callable, non-null means record-triggered (not callable)

## Source

- **Reflection**: 0d5fe93e-60c4-4e5b-8335-bf985ff5de43
- **Agent**: manual-discovery
- **Enriched**: 2026-04-03
