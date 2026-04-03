---
name: marketo-form-replacement-detection
description: "When a form shows zero recent submissions, check the live webpage to verify the form is still embedded. Compare current form embed with expected form ID."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-marketo:WebFetch + marketo-analytics-assessor
---

# Marketo Form Replacement Detection

When a form shows zero recent submissions, check the live webpage to verify the form is still embedded. Compare current form embed with expected form ID.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. When a form shows zero recent submissions, check the live webpage to verify the form is still embedded
2. Compare current form embed with expected form ID

## Source

- **Reflection**: f7b16b3b-4173-464a-b154-ac80034762c5
- **Agent**: WebFetch + marketo-analytics-assessor
- **Enriched**: 2026-04-03
