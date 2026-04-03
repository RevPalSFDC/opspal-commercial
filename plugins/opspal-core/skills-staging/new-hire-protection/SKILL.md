---
name: new-hire-protection
description: "Flag recently created accounts (< 30 days) in deactivation candidate lists to prevent accidental new hire deactivation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-query-specialist
---

# New Hire Protection

Flag recently created accounts (< 30 days) in deactivation candidate lists to prevent accidental new hire deactivation

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Flag recently created accounts (< 30 days) in deactivation candidate lists to prevent accidental new hire deactivation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: daad878d-58e6-47f8-a7ac-271b045bb57e
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
