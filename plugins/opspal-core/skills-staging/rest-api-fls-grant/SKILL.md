---
name: rest-api-fls-grant
description: "POST to /services/data/v62.0/sobjects/FieldPermissions with [COMPANY] (PermissionSet ID), SobjectType, Field, [SFDC_ID], [SFDC_ID] to grant field-level security without metadata deploy"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Rest Api Fls Grant

POST to /services/data/v62.0/sobjects/FieldPermissions with [COMPANY] (PermissionSet ID), SobjectType, Field, [SFDC_ID], [SFDC_ID] to grant field-level security without metadata deploy

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. POST to /services/data/v62
2. 0/sobjects/FieldPermissions with [COMPANY] (PermissionSet ID), SobjectType, Field, [SFDC_ID], [SFDC_ID] to grant field-level security without metadata deploy

## Source

- **Reflection**: 01b06248-68a4-4559-95cb-cce154402097
- **Agent**: direct execution
- **Enriched**: 2026-04-03
