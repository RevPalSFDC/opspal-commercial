---
name: flow-deactivation-via-tooling-api
description: "Use Tooling API PATCH on FlowDefinition with activeVersionNumber:0 to deactivate flows. Draft deploy creates new version but does not deactivate. Inactive is not a valid FlowVersionStatus."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-execution
---

# Flow Deactivation Via Tooling Api

Use Tooling API PATCH on FlowDefinition with activeVersionNumber:0 to deactivate flows. Draft deploy creates new version but does not deactivate. Inactive is not a valid FlowVersionStatus.

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Use Tooling API PATCH on FlowDefinition with activeVersionNumber:0 to deactivate flows
2. Draft deploy creates new version but does not deactivate
3. Inactive is not a valid FlowVersionStatus

## Source

- **Reflection**: 999bb96d-9efd-4506-a192-5c2fec780e72
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
