---
name: slack-external-upload-flow
description: "3-step upload: getUploadURLExternal -> POST to URL -> completeUploadExternal"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Slack External Upload Flow

3-step upload: getUploadURLExternal -> POST to URL -> completeUploadExternal

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: 3-step upload: getUploadURLExternal -> POST to URL -> completeUploadExternal
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: dc1778fa-5fdb-4461-8df0-2f656e73373a
- **Agent**: manual implementation
- **Enriched**: 2026-04-03
