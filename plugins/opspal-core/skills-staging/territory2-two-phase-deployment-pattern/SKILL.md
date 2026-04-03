---
name: territory2-two-phase-deployment-pattern
description: "For Territory2 deployments: Phase 1 - Deploy [SFDC_ID] metadata and create Territory2 records via Data API (structural), Phase 2 - Transform ruleAssociations into Territory2Rule metadata and deploy via metadata API (functional). This pattern works around CLI limitations and ensures complete deployment."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Territory2 Two Phase Deployment Pattern

For Territory2 deployments: Phase 1 - Deploy [SFDC_ID] metadata and create Territory2 records via Data API (structural), Phase 2 - Transform ruleAssociations into Territory2Rule metadata and deploy via metadata API (functional). This pattern works around CLI limitations and ensures complete deployment.

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. For Territory2 deployments: Phase 1 - Deploy [SFDC_ID] metadata and create Territory2 records via Data API (structural), Phase 2 - Transform ruleAssociations into Territory2Rule metadata and deploy via metadata API (functional)
2. This pattern works around CLI limitations and ensures complete deployment

## Source

- **Reflection**: 1566c1a7-aa6a-4212-8572-f1a9687152f8
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
