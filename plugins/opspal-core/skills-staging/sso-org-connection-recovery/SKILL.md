---
name: sso-org-connection-recovery
description: "When device flow fails with 'not enabled' error, immediately try web login without instance URL"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Sso Org Connection Recovery

When device flow fails with 'not enabled' error, immediately try web login without instance URL

## When to Use This Skill

- When encountering errors that match this pattern
- When working with Salesforce Flows or automation

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When device flow fails with 'not enabled' error, immediately try web login without instance URL
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 24d64783-4985-45f5-be0b-17c1d6168360
- **Agent**: manual
- **Enriched**: 2026-04-03
