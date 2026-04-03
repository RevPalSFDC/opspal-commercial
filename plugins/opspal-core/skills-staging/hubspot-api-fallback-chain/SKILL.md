---
name: hubspot-api-fallback-chain
description: "When browser auth fails, fall back to API token; use v1 API for filter definitions, v3 for search, v4 for workflows"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:hubspot-sfdc-sync-scraper
---

# Hubspot Api Fallback Chain

When browser auth fails, fall back to API token; use v1 API for filter definitions, v3 for search, v4 for workflows

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When browser auth fails, fall back to API token
2. use v1 API for filter definitions, v3 for search, v4 for workflows

## Source

- **Reflection**: 3906f5a8-2737-4a12-965f-d396323be984
- **Agent**: hubspot-sfdc-sync-scraper
- **Enriched**: 2026-04-03
