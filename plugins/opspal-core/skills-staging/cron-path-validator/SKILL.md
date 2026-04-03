---
name: cron-path-validator
description: "Before deploying any new cron job, simulate execution with minimal PATH to verify all CLIs resolve"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Cron Path Validator

Before deploying any new cron job, simulate execution with minimal PATH to verify all CLIs resolve

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- When encountering errors that match this pattern

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before deploying any new cron job, simulate execution with minimal PATH to verify all CLIs resolve
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4b3b169b-9e0c-482f-9a96-f114ddb45324
- **Agent**: manual debugging
- **Enriched**: 2026-04-03
