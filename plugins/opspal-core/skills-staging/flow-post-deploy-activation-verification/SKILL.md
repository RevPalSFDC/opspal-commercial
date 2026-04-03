---
name: flow-post-deploy-activation-verification
description: "After deploying Flow metadata, query [SFDC_ID] to verify [SFDC_ID] is set. If null, activate via Tooling API PATCH."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Flow Post Deploy Activation Verification

After deploying Flow metadata, query [SFDC_ID] to verify [SFDC_ID] is set. If null, activate via Tooling API PATCH.

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. After deploying Flow metadata, query [SFDC_ID] to verify [SFDC_ID] is set
2. If null, activate via Tooling API PATCH

## Source

- **Reflection**: b7cc6fb3-ce84-46ad-94a7-98519b3e75c6
- **Agent**: manual (sfdc-deployment-manager should incorporate)
- **Enriched**: 2026-04-03
