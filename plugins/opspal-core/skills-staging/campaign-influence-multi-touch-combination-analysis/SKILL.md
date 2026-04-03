---
name: campaign-influence-multi-touch-combination-analysis
description: "Pull CampaignInfluence detail records, group by OpportunityId to build campaign sets, then count combination frequencies with associated deal metrics. Requires client-side processing due to SOQL semi-join limitations."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Campaign Influence Multi Touch Combination Analysis

Pull CampaignInfluence detail records, group by OpportunityId to build campaign sets, then count combination frequencies with associated deal metrics. Requires client-side processing due to SOQL semi-join limitations.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Pull CampaignInfluence detail records, group by OpportunityId to build campaign sets, then count combination frequencies with associated deal metrics
2. Requires client-side processing due to SOQL semi-join limitations

## Source

- **Reflection**: 4450ee10-0088-4089-94d4-f2afe1b28c71
- **Agent**: direct execution
- **Enriched**: 2026-04-03
