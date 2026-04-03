---
name: hook-script-direct-patching
description: "When hook env vars cannot be overridden via .env, patch the hook script default directly in both marketplace and cache plugin directories"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct (no agent)
---

# Hook Script Direct Patching

When hook env vars cannot be overridden via .env, patch the hook script default directly in both marketplace and cache plugin directories

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When hook env vars cannot be overridden via
2. env, patch the hook script default directly in both marketplace and cache plugin directories

## Source

- **Reflection**: e685157c-5939-4def-81b5-e13715cce249
- **Agent**: direct (no agent)
- **Enriched**: 2026-04-03
