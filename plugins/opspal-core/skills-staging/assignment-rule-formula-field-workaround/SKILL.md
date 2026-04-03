---
name: assignment-rule-formula-field-workaround
description: "When assignment rules need to reference fields on related objects (e.g., Campaign.Name via lookup), create a formula field on the primary object that exposes the related field value"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-automation-builder
---

# Assignment Rule Formula Field Workaround

When assignment rules need to reference fields on related objects (e.g., Campaign.Name via lookup), create a formula field on the primary object that exposes the related field value

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. When assignment rules need to reference fields on related objects (e
2. Name via lookup), create a formula field on the primary object that exposes the related field value

## Source

- **Reflection**: 10b55737-ca33-450b-b1c6-a27d443a5fa3
- **Agent**: sfdc-automation-builder
- **Enriched**: 2026-04-03
