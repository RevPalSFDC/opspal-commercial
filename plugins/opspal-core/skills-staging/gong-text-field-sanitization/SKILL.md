---
name: gong-text-field-sanitization
description: "Apply html.unescape() + regex HTML tag stripping to all Gong__Call_*__c text fields before rendering to markdown/PDF. Gong stores rich text with [COMPANY] encoding in Salesforce long text fields."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Gong Text Field Sanitization

Apply html.unescape() + regex HTML tag stripping to all Gong__Call_*__c text fields before rendering to markdown/PDF. Gong stores rich text with [COMPANY] encoding in Salesforce long text fields.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. unescape() + regex HTML tag stripping to all Gong__Call_*__c text fields before rendering to markdown/PDF
2. Gong stores rich text with [COMPANY] encoding in Salesforce long text fields

## Source

- **Reflection**: 1a4dbd61-33d9-4b1c-ba41-28b952f13ca1
- **Agent**: manual
- **Enriched**: 2026-04-03
