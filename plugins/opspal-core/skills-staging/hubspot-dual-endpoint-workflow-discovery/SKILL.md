---
name: hubspot-dual-endpoint-workflow-discovery
description: "Query v4 /automation/v4/flows for complete workflow list, v3 /automation/v3/workflows for accurate enabled status, merge by workflow ID"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:direct-orchestration
---

# Hubspot Dual Endpoint Workflow Discovery

Query v4 /automation/v4/flows for complete workflow list, v3 /automation/v3/workflows for accurate enabled status, merge by workflow ID

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query v4 /automation/v4/flows for complete workflow list, v3 /automation/v3/workflows for accurate enabled status, merge by workflow ID
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 630290b1-f517-4a29-9658-67867b46945e
- **Agent**: direct-orchestration
- **Enriched**: 2026-04-03
