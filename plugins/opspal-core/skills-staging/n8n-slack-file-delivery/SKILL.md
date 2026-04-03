---
name: n8n-slack-file-delivery
description: "Upload files to Slack with rate limiting: splitInBatches (batch=1) -> upload -> wait (1s) -> loop back"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:Plan
---

# N8n Slack File Delivery

Upload files to Slack with rate limiting: splitInBatches (batch=1) -> upload -> wait (1s) -> loop back

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Upload files to Slack with rate limiting: splitInBatches (batch=1) -> upload -> wait (1s) -> loop back
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 8ce673c0-7d2e-4c2b-81c4-609e0d204c3e
- **Agent**: Plan
- **Enriched**: 2026-04-03
