---
name: slack-dm-channel-resolution
description: "Use conversations.open with user ID to get current DM channel; never cache DM channel IDs"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Slack Dm Channel Resolution

Use conversations.open with user ID to get current DM channel; never cache DM channel IDs

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Use conversations
2. open with user ID to get current DM channel
3. never cache DM channel IDs

## Source

- **Reflection**: a13b82f0-10fc-4f09-ac0f-dac839e66961
- **Agent**: manual
- **Enriched**: 2026-04-03
