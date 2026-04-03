---
name: flow-version-activation-via-sf-api-request-rest
description: "Use sf api request rest --method PATCH to activate Draft flow versions when sf project deploy creates them as Draft instead of Active"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Flow Version Activation Via Sf Api Request Rest

Use sf api request rest --method PATCH to activate Draft flow versions when sf project deploy creates them as Draft instead of Active

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use sf api request rest --method PATCH to activate Draft flow versions when sf project deploy creates them as Draft instead of Active
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 216d2a77-bee4-48d7-8cbe-771a461e0190
- **Agent**: direct execution
- **Enriched**: 2026-04-03
