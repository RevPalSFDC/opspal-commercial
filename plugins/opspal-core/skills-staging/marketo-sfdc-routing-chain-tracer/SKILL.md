---
name: marketo-sfdc-routing-chain-tracer
description: "Trace lead routing from [COMPANY] trigger through dispatcher campaign, account-owner matching, round-robin, SFDC sync, and notification. Verify both Marketo flow steps and SFDC assignment rules exist."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:marketo-orchestrator + sfdc-query-specialist
---

# Marketo Sfdc Routing Chain Tracer

Trace lead routing from [COMPANY] trigger through dispatcher campaign, account-owner matching, round-robin, SFDC sync, and notification. Verify both Marketo flow steps and SFDC assignment rules exist.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Trace lead routing from [COMPANY] trigger through dispatcher campaign, account-owner matching, round-robin, SFDC sync, and notification
2. Verify both Marketo flow steps and SFDC assignment rules exist

## Source

- **Reflection**: 14c455e9-df60-48cc-93e4-7ab35e8e9815
- **Agent**: marketo-orchestrator + sfdc-query-specialist
- **Enriched**: 2026-04-03
