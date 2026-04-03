---
name: password-reset-after-user-creation
description: "After creating a new Salesforce user, automatically send password reset email using System.resetPassword(userId, true)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Password Reset After User Creation

After creating a new Salesforce user, automatically send password reset email using System.resetPassword(userId, true)

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. After creating a new Salesforce user, automatically send password reset email using System
2. resetPassword(userId, true)

## Source

- **Reflection**: 87661540-9579-49c8-9a3c-ff8dbb4c4260
- **Agent**: manual apex execution
- **Enriched**: 2026-04-03
