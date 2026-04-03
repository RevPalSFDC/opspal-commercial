---
name: tooling-api-flow-activation-via-curl
description: "Extract access token via sf org display --json, then curl PATCH to /tooling/sobjects/FlowDefinition/<id> with {Metadata:{activeVersionNumber:N}}. More reliable than sf api request rest."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Tooling Api Flow Activation Via Curl

Extract access token via sf org display --json, then curl PATCH to /tooling/sobjects/FlowDefinition/<id> with {Metadata:{activeVersionNumber:N}}. More reliable than sf api request rest.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Extract access token via sf org display --json, then curl PATCH to /tooling/sobjects/FlowDefinition/<id> with {Metadata:{activeVersionNumber:N}}
2. More reliable than sf api request rest

## Source

- **Reflection**: 6dcc677e-a05c-4dab-b82a-79aa86a558a7
- **Agent**: manual workaround
- **Enriched**: 2026-04-03
