---
name: fls-aware-field-deployment
description: "When deploying custom fields, always bundle a permission set with [COMPANY] grants and verify queryability post-deploy. Deploy reported success does not guarantee API accessibility."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-metadata-manager
---

# Fls Aware Field Deployment

When deploying custom fields, always bundle a permission set with [COMPANY] grants and verify queryability post-deploy. Deploy reported success does not guarantee API accessibility.

## When to Use This Skill

- When deploying metadata that involves the patterns described here
- When building or modifying reports and dashboards

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. When deploying custom fields, always bundle a permission set with [COMPANY] grants and verify queryability post-deploy
2. Deploy reported success does not guarantee API accessibility

## Source

- **Reflection**: 8d620f82-ea28-481e-a50b-b8f40e6059b2
- **Agent**: sfdc-metadata-manager
- **Enriched**: 2026-04-03
