---
name: production-flow-activation-verification
description: "After deploying flows to production, verify activation status via Tooling API query on FlowDefinition. If [SFDC_ID] is null, provide UI activation link: https://[instance].my.salesforce.com/lightning/setup/Flows/home"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Production Flow Activation Verification

After deploying flows to production, verify activation status via Tooling API query on FlowDefinition. If [SFDC_ID] is null, provide UI activation link: https://[instance].my.salesforce.com/lightning/setup/Flows/home

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. After deploying flows to production, verify activation status via Tooling API query on FlowDefinition
2. If [SFDC_ID] is null, provide UI activation link: https://[instance]
3. com/lightning/setup/Flows/home

## Source

- **Reflection**: a625f5ec-010e-4974-a4c3-07f0b3bb0c28
- **Agent**: manual
- **Enriched**: 2026-04-03
