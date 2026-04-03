---
name: marketo-api-limitation-detection
description: "When Marketo task involves flow steps, immediately flag that REST API cannot expose flow configuration and route to UI-based workflow"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-marketo:marketo-campaign-diagnostician
---

# Marketo Api Limitation Detection

When Marketo task involves flow steps, immediately flag that REST API cannot expose flow configuration and route to UI-based workflow

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When Marketo task involves flow steps, immediately flag that REST API cannot expose flow configuration and route to UI-based workflow
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: b63d903b-282a-45e1-9fb9-9ac0359874f7
- **Agent**: opspal-marketo:marketo-campaign-diagnostician
- **Enriched**: 2026-04-03
