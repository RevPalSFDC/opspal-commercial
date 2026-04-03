---
name: async-context-detection-pattern
description: "Check System.isQueueable()/isBatch()/isFuture() before enqueueing jobs; fall back to sync execution when in async context"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-apex-developer
---

# Async Context Detection Pattern

Check System.isQueueable()/isBatch()/isFuture() before enqueueing jobs; fall back to sync execution when in async context

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Check System
2. isQueueable()/isBatch()/isFuture() before enqueueing jobs
3. fall back to sync execution when in async context

## Source

- **Reflection**: 15246fd8-452d-43bb-a1e5-0b3b8dd9546e
- **Agent**: sfdc-apex-developer
- **Enriched**: 2026-04-03
