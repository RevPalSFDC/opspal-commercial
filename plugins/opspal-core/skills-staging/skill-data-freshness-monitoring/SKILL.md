---
name: skill-data-freshness-monitoring
description: "Check skill-data.json mtime, calculate days since last update, warn if >14 days stale, suggest /reflect to refresh"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:ace-health-check.js
---

# Skill Data Freshness Monitoring

Check skill-data.json mtime, calculate days since last update, warn if >14 days stale, suggest /reflect to refresh

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Check skill-data
2. json mtime, calculate days since last update, warn if >14 days stale, suggest /reflect to refresh

## Source

- **Reflection**: 70d7ef68-226e-4959-a78c-6d2436b3e8da
- **Agent**: ace-health-check.js
- **Enriched**: 2026-04-03
