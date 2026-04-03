---
name: territory-realignment-trigger-via-rule-toggle
description: "Toggle ObjectTerritory2AssignmentRule.IsActive false then true to trigger territory realignment without metadata redeployment"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Territory Realignment Trigger Via Rule Toggle

Toggle ObjectTerritory2AssignmentRule.IsActive false then true to trigger territory realignment without metadata redeployment

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Toggle ObjectTerritory2AssignmentRule
2. IsActive false then true to trigger territory realignment without metadata redeployment

## Source

- **Reflection**: 0fdbb795-7b79-43db-9a18-f6b2fc655cc7
- **Agent**: manual
- **Enriched**: 2026-04-03
