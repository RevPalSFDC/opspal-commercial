---
name: handoff-document-best-practices
description: "Always clarify ACTIVE vs INACTIVE status in deployment tables; include actual test results rather than [SFDC_ID]; explain when testing was performed relative to activation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Handoff Document Best Practices

Always clarify ACTIVE vs INACTIVE status in deployment tables; include actual test results rather than [SFDC_ID]; explain when testing was performed relative to activation

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: documentation
**Discovered from**: reflection analysis

## Workflow

1. Always clarify ACTIVE vs INACTIVE status in deployment tables
2. include actual test results rather than [SFDC_ID]
3. explain when testing was performed relative to activation

## Source

- **Reflection**: cc9bf8e6-a213-4816-9c45-6e87744ec8d3
- **Agent**: direct execution
- **Enriched**: 2026-04-03
