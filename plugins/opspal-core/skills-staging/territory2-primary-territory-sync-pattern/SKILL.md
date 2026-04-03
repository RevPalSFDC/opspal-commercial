---
name: territory2-primary-territory-sync-pattern
description: "Use Account trigger + Queueable to sync territory data since OTA is not triggerable. Store in text fields since lookup to Territory2 not allowed."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-orchestrator
---

# Territory2 Primary Territory Sync Pattern

Use Account trigger + Queueable to sync territory data since OTA is not triggerable. Store in text fields since lookup to Territory2 not allowed.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Use Account trigger + Queueable to sync territory data since OTA is not triggerable
2. Store in text fields since lookup to Territory2 not allowed

## Source

- **Reflection**: 84b5e2ad-b1d9-4bc4-902d-5e617c70354a
- **Agent**: sfdc-territory-orchestrator
- **Enriched**: 2026-04-03
