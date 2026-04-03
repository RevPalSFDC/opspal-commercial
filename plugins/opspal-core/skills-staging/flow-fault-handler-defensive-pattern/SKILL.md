---
name: flow-fault-handler-defensive-pattern
description: "All Record Delete and Record Update elements in flows should have faultConnector routing to a no-op assignment element. Prevents CANNOT_EXECUTE_FLOW_TRIGGER errors when scheduled paths find no matching records."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-deployment-manager
---

# Flow Fault Handler Defensive Pattern

All Record Delete and Record Update elements in flows should have faultConnector routing to a no-op assignment element. Prevents CANNOT_EXECUTE_FLOW_TRIGGER errors when scheduled paths find no matching records.

## When to Use This Skill

- When encountering errors that match this pattern
- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. All Record Delete and Record Update elements in flows should have faultConnector routing to a no-op assignment element
2. Prevents CANNOT_EXECUTE_FLOW_TRIGGER errors when scheduled paths find no matching records

## Source

- **Reflection**: 0152dee2-9f5c-4a04-8529-c1cb97b5173f
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
