---
name: marketo-email-2.0-freeform-workaround
description: "When Marketo API returns error 709 on freeform emails: extract fullContent HTML, modify locally, create template from HTML, create new email from template"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-marketo:marketo-email-specialist
---

# Marketo Email 2.0 Freeform Workaround

When Marketo API returns error 709 on freeform emails: extract fullContent HTML, modify locally, create template from HTML, create new email from template

## When to Use This Skill

- When encountering errors that match this pattern

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When Marketo API returns error 709 on freeform emails: extract fullContent HTML, modify locally, create template from HTML, create new email from template
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 54c9ae90-9bb3-441f-be57-6b59438ef641
- **Agent**: marketo-email-specialist
- **Enriched**: 2026-04-03
