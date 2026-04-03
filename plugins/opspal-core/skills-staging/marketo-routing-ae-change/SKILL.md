---
name: marketo-routing-ae-change
description: "Query SFDC for AE User IDs → Query SFDC for lead distribution → Access Marketo UI for flow step inspection/modification → Test routing → Update docs"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-marketo:marketo-campaign-builder
---

# Marketo Routing Ae Change

Query SFDC for AE User IDs → Query SFDC for lead distribution → Access Marketo UI for flow step inspection/modification → Test routing → Update docs

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query SFDC for AE User IDs → Query SFDC for lead distribution → Access Marketo UI for flow step inspection/modification → Test routing → Update docs
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: b63d903b-282a-45e1-9fb9-9ac0359874f7
- **Agent**: opspal-marketo:marketo-campaign-builder
- **Enriched**: 2026-04-03
