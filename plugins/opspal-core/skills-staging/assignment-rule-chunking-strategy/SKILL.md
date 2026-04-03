---
name: assignment-rule-chunking-strategy
description: "When creating Territory2 assignment rules with >10 criteria, automatically split into multiple rules with standardized naming ([TerritoryName]_Part[N]). Each rule respects the 10-item limit while maintaining logical grouping."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-orchestrator
---

# Assignment Rule Chunking Strategy

When creating Territory2 assignment rules with >10 criteria, automatically split into multiple rules with standardized naming ([TerritoryName]_Part[N]). Each rule respects the 10-item limit while maintaining logical grouping.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When creating Territory2 assignment rules with >10 criteria, automatically split into multiple rules with standardized naming ([TerritoryName]_Part[N])
2. Each rule respects the 10-item limit while maintaining logical grouping

## Source

- **Reflection**: 0ef91656-422b-4294-930e-a63e4188d20d
- **Agent**: sfdc-orchestrator
- **Enriched**: 2026-04-03
