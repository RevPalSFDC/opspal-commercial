---
name: flow-runtime-smoke-test
description: "After deploying and activating flows, create a minimal test record to trigger each flow and verify the expected field mutation occurred. Flow activation success does NOT prove field references are valid."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:diagnostic-analysis
---

# Flow Runtime Smoke Test

After deploying and activating flows, create a minimal test record to trigger each flow and verify the expected field mutation occurred. Flow activation success does NOT prove field references are valid.

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. After deploying and activating flows, create a minimal test record to trigger each flow and verify the expected field mutation occurred
2. Flow activation success does NOT prove field references are valid

## Source

- **Reflection**: 3ced6263-c01a-45fc-8602-c0ad6f1ed6a3
- **Agent**: diagnostic-analysis
- **Enriched**: 2026-04-03
