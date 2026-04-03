---
name: opportunity-owner-preservation
description: "Verify opportunity owners remain unchanged after account owner updates using sample comparison and count verification"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-data-operations
---

# Opportunity Owner Preservation

Verify opportunity owners remain unchanged after account owner updates using sample comparison and count verification

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Verify opportunity owners remain unchanged after account owner updates using sample comparison and count verification
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: d146bfbc-69ae-4f36-8f0a-557b2b70d46f
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
