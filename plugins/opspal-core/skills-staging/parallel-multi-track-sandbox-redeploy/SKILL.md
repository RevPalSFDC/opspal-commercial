---
name: parallel-multi-track-sandbox-redeploy
description: "After sandbox refresh, create comprehensive manifest bundling all metadata, then launch parallel tracks for metadata deploy, Apex package deploy, and data updates. Regenerate data CSVs from live queries since IDs change post-refresh."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-deployment-manager
---

# Parallel Multi Track Sandbox Redeploy

After sandbox refresh, create comprehensive manifest bundling all metadata, then launch parallel tracks for metadata deploy, Apex package deploy, and data updates. Regenerate data CSVs from live queries since IDs change post-refresh.

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. After sandbox refresh, create comprehensive manifest bundling all metadata, then launch parallel tracks for metadata deploy, Apex package deploy, and data updates
2. Regenerate data CSVs from live queries since IDs change post-refresh

## Source

- **Reflection**: 0152dee2-9f5c-4a04-8529-c1cb97b5173f
- **Agent**: sfdc-deployment-manager
- **Enriched**: 2026-04-03
