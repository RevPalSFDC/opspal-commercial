---
name: flexipage-standalone-conversion
description: "Convert [SFDC_ID]-based layouts to standalone by removing [SFDC_ID], tabset, and mode=Replace; use force:recordDetailPanelMobile in main region"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct CLI
---

# Flexipage Standalone Conversion

Convert [SFDC_ID]-based layouts to standalone by removing [SFDC_ID], tabset, and mode=Replace; use force:recordDetailPanelMobile in main region

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Convert [SFDC_ID]-based layouts to standalone by removing [SFDC_ID], tabset, and mode=Replace
2. use force:recordDetailPanelMobile in main region

## Source

- **Reflection**: d6ee45d3-43a5-48db-8ff9-7d59548d519b
- **Agent**: direct CLI
- **Enriched**: 2026-04-03
