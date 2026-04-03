---
name: slack-3-step-file-upload
description: "getUploadURLExternal -> POST binary to URL -> completeUploadExternal with channel_id for sharing"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:Direct implementation
---

# Slack 3 Step File Upload

getUploadURLExternal -> POST binary to URL -> completeUploadExternal with channel_id for sharing

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: getUploadURLExternal -> POST binary to URL -> completeUploadExternal with channel_id for sharing
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 90432622-ab93-4c17-841d-6a3561221be2
- **Agent**: Direct implementation
- **Enriched**: 2026-04-03
