---
name: stage-sequence-aware-sandbox-testing
description: "When testing Closed Won transitions in sandboxes with stage sequence VRs, advance through stages one at a time via REST API PATCH rather than jumping directly to Closed Won"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:direct execution after sfdc-orchestrator test runner hit VR
---

# Stage Sequence Aware Sandbox Testing

When testing Closed Won transitions in sandboxes with stage sequence VRs, advance through stages one at a time via REST API PATCH rather than jumping directly to Closed Won

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When testing Closed Won transitions in sandboxes with stage sequence VRs, advance through stages one at a time via REST API PATCH rather than jumping directly to Closed Won
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 167680ab-dd0f-4c49-b0ce-9640d64596cc
- **Agent**: direct execution after sfdc-orchestrator test runner hit VR
- **Enriched**: 2026-04-03
