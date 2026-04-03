---
name: fls-grant-via-fieldpermissions-rest-api
description: "Query FieldPermissions for baseline field, generate matching records for new fields, POST each via REST API. Handle FIELD_INTEGRITY_EXCEPTION for integration-only licenses and View All Fields global permission."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:direct execution (after sfdc-permission-orchestrator profile deploy failed)
---

# Fls Grant Via Fieldpermissions Rest Api

Query FieldPermissions for baseline field, generate matching records for new fields, POST each via REST API. Handle FIELD_INTEGRITY_EXCEPTION for integration-only licenses and View All Fields global permission.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Query FieldPermissions for baseline field, generate matching records for new fields, POST each via REST API
2. Handle FIELD_INTEGRITY_EXCEPTION for integration-only licenses and View All Fields global permission

## Source

- **Reflection**: 4c97396c-cda1-43ea-a65e-5263b7c2ccc3
- **Agent**: direct execution (after sfdc-permission-orchestrator profile deploy failed)
- **Enriched**: 2026-04-03
