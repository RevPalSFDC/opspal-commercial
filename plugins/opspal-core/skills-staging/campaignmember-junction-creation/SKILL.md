---
name: campaignmember-junction-creation
description: "CampaignMember objects require sf data create record for individual creation; bulk upsert with Id external-id doesn't work"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
---

# Campaignmember Junction Creation

CampaignMember objects require sf data create record for individual creation; bulk upsert with Id external-id doesn't work

## When to Use This Skill

- During data import or bulk operations

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. CampaignMember objects require sf data create record for individual creation
2. bulk upsert with Id external-id doesn't work

## Source

- **Reflection**: cdf0a3dd-7ac1-4390-9856-9b81ac9ea2f8
- **Agent**: manual
- **Enriched**: 2026-04-03
