---
name: keyword-classification-flow-with-mutual-exclusion-guards
description: "For keyword-matching flows where categories have overlapping keywords across priority levels, add explicit exclusion conditions (e.g., IsFederal=false) to prevent lower-priority categories from incorrectly matching entities that belong to higher-priority categories evaluated later in the flow"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-automation-builder
---

# Keyword Classification Flow With Mutual Exclusion Guards

For keyword-matching flows where categories have overlapping keywords across priority levels, add explicit exclusion conditions (e.g., IsFederal=false) to prevent lower-priority categories from incorrectly matching entities that belong to higher-priority categories evaluated later in the flow

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. For keyword-matching flows where categories have overlapping keywords across priority levels, add explicit exclusion conditions (e
2. , IsFederal=false) to prevent lower-priority categories from incorrectly matching entities that belong to higher-priority categories evaluated later in the flow

## Source

- **Reflection**: c4a08214-319d-4f18-a707-d90b3e391fe8
- **Agent**: opspal-salesforce:sfdc-automation-builder
- **Enriched**: 2026-04-03
