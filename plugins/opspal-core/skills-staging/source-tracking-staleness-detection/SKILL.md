---
name: source-tracking-staleness-detection
description: "When deploy reports all 'Unchanged' but fields are missing, source tracking cache is stale. Cross-check with [COMPANY] API, then reset tracking and redeploy."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Source Tracking Staleness Detection

When deploy reports all 'Unchanged' but fields are missing, source tracking cache is stale. Cross-check with [COMPANY] API, then reset tracking and redeploy.

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When building or modifying reports and dashboards

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When deploy reports all 'Unchanged' but fields are missing, source tracking cache is stale
2. Cross-check with [COMPANY] API, then reset tracking and redeploy

## Source

- **Reflection**: 9d642c3c-d9ab-4628-bed9-93db7c5c4ddb
- **Agent**: direct execution
- **Enriched**: 2026-04-03
