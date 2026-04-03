---
name: flow-picklist-cache-refresh-via-tooling-api
description: "When a before-save flow rejects a newly-added restricted picklist value, use Tooling API to deactivate (activeVersionNumber:0) then reactivate (activeVersionNumber:N) the FlowDefinition to force a full server-side recompile."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:playwright-browser-controller (cache-fixer)
---

# Flow Picklist Cache Refresh Via Tooling Api

When a before-save flow rejects a newly-added restricted picklist value, use Tooling API to deactivate (activeVersionNumber:0) then reactivate (activeVersionNumber:N) the FlowDefinition to force a full server-side recompile.

## When to Use This Skill

- Before executing the operation described in this skill
- When working with Salesforce Flows or automation

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When a before-save flow rejects a newly-added restricted picklist value, use Tooling API to deactivate (activeVersionNumber:0) then reactivate (activeVersionNumber:N) the FlowDefinition to force a full server-side recompile.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2cd1fc6f-231e-42c1-aa05-1d0e5b666325
- **Agent**: opspal-core:playwright-browser-controller (cache-fixer)
- **Enriched**: 2026-04-03
