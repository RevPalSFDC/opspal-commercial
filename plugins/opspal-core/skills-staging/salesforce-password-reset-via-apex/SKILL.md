---
name: salesforce-password-reset-via-apex
description: "Use System.resetPassword(userId, sendEmail) in anonymous Apex to trigger password reset emails"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct-execution
---

# Salesforce Password Reset Via Apex

Use System.resetPassword(userId, sendEmail) in anonymous Apex to trigger password reset emails

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use System.resetPassword(userId, sendEmail) in anonymous Apex to trigger password reset emails
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 3a1c5e7e-4090-4edf-aef0-6389254b3d46
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
