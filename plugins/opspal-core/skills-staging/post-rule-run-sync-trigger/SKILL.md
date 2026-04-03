---
name: post-rule-run-sync-trigger
description: "After triggering territory assignment rules, invoke PrimaryTerritorySyncHandler.syncAccountTerritories() via Anonymous Apex for affected accounts to avoid batch timing race condition"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Post Rule Run Sync Trigger

After triggering territory assignment rules, invoke PrimaryTerritorySyncHandler.syncAccountTerritories() via Anonymous Apex for affected accounts to avoid batch timing race condition

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. After triggering territory assignment rules, invoke PrimaryTerritorySyncHandler
2. syncAccountTerritories() via Anonymous Apex for affected accounts to avoid batch timing race condition

## Source

- **Reflection**: 6cf899ca-cbce-459d-b800-f91f1b6dd8ca
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
