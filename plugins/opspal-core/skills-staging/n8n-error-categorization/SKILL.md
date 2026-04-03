---
name: n8n-error-categorization
description: "Categorize errors by searching stderr for keywords (SOQL, openpyxl, PDF, Permission, timeout) and route to appropriate handlers"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:Plan
---

# N8n Error Categorization

Categorize errors by searching stderr for keywords (SOQL, openpyxl, PDF, Permission, timeout) and route to appropriate handlers

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Categorize errors by searching stderr for keywords (SOQL, openpyxl, PDF, Permission, timeout) and route to appropriate handlers
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 8ce673c0-7d2e-4c2b-81c4-609e0d204c3e
- **Agent**: Plan
- **Enriched**: 2026-04-03
