---
name: destructive-sharing-rule-deployment
description: "When replacing sharing rules: deploy new rules first → create [SFDC_ID].xml → deploy with --post-destructive-changes flag → verify rules removed"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Destructive Sharing Rule Deployment

When replacing sharing rules: deploy new rules first → create [SFDC_ID].xml → deploy with --post-destructive-changes flag → verify rules removed

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. When replacing sharing rules: deploy new rules first → create [SFDC_ID]
2. xml → deploy with --post-destructive-changes flag → verify rules removed

## Source

- **Reflection**: 092413b7-4c8c-4e8f-b0fb-99e9da211493
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
