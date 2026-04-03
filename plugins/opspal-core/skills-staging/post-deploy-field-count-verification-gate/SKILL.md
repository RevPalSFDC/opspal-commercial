---
name: post-deploy-field-count-verification-gate
description: "After every metadata deploy that includes custom fields, run sf sobject describe and compare expected vs actual custom field count. Block downstream batches if mismatch detected."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:diagnostic-analysis
---

# Post Deploy Field Count Verification Gate

After every metadata deploy that includes custom fields, run sf sobject describe and compare expected vs actual custom field count. Block downstream batches if mismatch detected.

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. After every metadata deploy that includes custom fields, run sf sobject describe and compare expected vs actual custom field count
2. Block downstream batches if mismatch detected

## Source

- **Reflection**: 3ced6263-c01a-45fc-8602-c0ad6f1ed6a3
- **Agent**: diagnostic-analysis
- **Enriched**: 2026-04-03
