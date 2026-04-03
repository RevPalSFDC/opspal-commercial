---
name: recordtype-based-picklist-defaulting
description: "Before-save flow with [COMPANY] NULL entry filter + Decision on RecordType.DeveloperName + Assignment per branch. Pairs with [COMPANY] deploy and Apex backfill."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-orchestrator
---

# Recordtype Based Picklist Defaulting

Before-save flow with [COMPANY] NULL entry filter + Decision on RecordType.DeveloperName + Assignment per branch. Pairs with [COMPANY] deploy and Apex backfill.

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Before-save flow with [COMPANY] NULL entry filter + Decision on RecordType
2. DeveloperName + Assignment per branch
3. Pairs with [COMPANY] deploy and Apex backfill

## Source

- **Reflection**: d3d8f764-e84f-4d9f-95d6-9ba6380a49a6
- **Agent**: sfdc-orchestrator
- **Enriched**: 2026-04-03
