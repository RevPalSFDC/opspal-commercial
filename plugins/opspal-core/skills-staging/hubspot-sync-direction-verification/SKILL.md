---
name: hubspot-sync-direction-verification
description: "Check if synced property (marketing_stage__c) has history - empty history suggests one-way sync"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-hubspot:hubspot-orchestrator
---

# Hubspot Sync Direction Verification

Check if synced property (marketing_stage__c) has history - empty history suggests one-way sync

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Check if synced property (marketing_stage__c) has history - empty history suggests one-way sync
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 11595b9d-2643-4002-b15a-17bad3678d21
- **Agent**: hubspot-orchestrator
- **Enriched**: 2026-04-03
