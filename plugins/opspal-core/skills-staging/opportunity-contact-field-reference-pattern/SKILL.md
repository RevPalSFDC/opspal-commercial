---
name: opportunity-contact-field-reference-pattern
description: "When referencing Contact from Opportunity in flows, use custom Contact__c lookup field (editable) instead of standard ContactId (read-only, auto-populated from Contact Roles)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-automation-builder
---

# Opportunity Contact Field Reference Pattern

When referencing Contact from Opportunity in flows, use custom Contact__c lookup field (editable) instead of standard ContactId (read-only, auto-populated from Contact Roles)

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When referencing Contact from Opportunity in flows, use custom Contact__c lookup field (editable) instead of standard ContactId (read-only, auto-populated from Contact Roles)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4a1d688d-fba5-4df4-ac7d-cd8dacd78b88
- **Agent**: sfdc-automation-builder
- **Enriched**: 2026-04-03
