---
name: hubspot-dual-endpoint-workflow-enumeration
description: "V4 /automation/v4/flows for complete enumeration (V3 caps at ~33), V3 /automation/v3/workflows for accurate enabled status. Merge by workflow ID."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:general-purpose (workflow inventory)
---

# Hubspot Dual Endpoint Workflow Enumeration

V4 /automation/v4/flows for complete enumeration (V3 caps at ~33), V3 /automation/v3/workflows for accurate enabled status. Merge by workflow ID.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. V4 /automation/v4/flows for complete enumeration (V3 caps at ~33), V3 /automation/v3/workflows for accurate enabled status
2. Merge by workflow ID

## Source

- **Reflection**: 242ad172-ece7-4696-b3f2-8f25f8b60950
- **Agent**: general-purpose (workflow inventory)
- **Enriched**: 2026-04-03
