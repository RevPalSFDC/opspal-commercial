---
name: slack-file-upload-v2
description: "3-step workflow: getUploadURLExternal -> POST binary -> completeUploadExternal"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Slack File Upload V2

3-step workflow: getUploadURLExternal -> POST binary -> completeUploadExternal

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: 3-step workflow: getUploadURLExternal -> POST binary -> completeUploadExternal
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a13b82f0-10fc-4f09-ac0f-dac839e66961
- **Agent**: manual
- **Enriched**: 2026-04-03
