---
name: dashboard-component-corruption-recovery
description: "When Analytics API PUT silently fails on dashboard components, use Metadata API two-pass deploy to force new component ID allocation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-reports-dashboards
---

# Dashboard Component Corruption Recovery

When Analytics API PUT silently fails on dashboard components, use Metadata API two-pass deploy to force new component ID allocation

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When building or modifying reports and dashboards

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When Analytics API PUT silently fails on dashboard components, use Metadata API two-pass deploy to force new component ID allocation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 25e782be-c024-46be-8213-677377ccedf6
- **Agent**: opspal-salesforce:sfdc-reports-dashboards
- **Enriched**: 2026-04-03
