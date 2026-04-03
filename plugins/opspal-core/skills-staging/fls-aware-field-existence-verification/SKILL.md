---
name: fls-aware-field-existence-verification
description: "When a field appears missing: (1) Check [SFDC_ID] via Tooling API (FLS-independent), (2) If found there, check FieldPermissions to identify the permission gap, (3) Only conclude deletion if [SFDC_ID] returns zero results. Never trust sf sobject describe or SOQL alone for field existence."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Fls Aware Field Existence Verification

When a field appears missing: (1) Check [SFDC_ID] via Tooling API (FLS-independent), (2) If found there, check FieldPermissions to identify the permission gap, (3) Only conclude deletion if [SFDC_ID] returns zero results. Never trust sf sobject describe or SOQL alone for field existence.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When a field appears missing: (1) Check [SFDC_ID] via Tooling API (FLS-independent), (2) If found there, check FieldPermissions to identify the permission gap, (3) Only conclude deletion if [SFDC_ID] returns zero results
2. Never trust sf sobject describe or SOQL alone for field existence

## Source

- **Reflection**: 915135c9-d4fb-42b7-a090-4f6668cd8559
- **Agent**: manual
- **Enriched**: 2026-04-03
