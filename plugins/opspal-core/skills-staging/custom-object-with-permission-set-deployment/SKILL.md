---
name: custom-object-with-permission-set-deployment
description: "Deploy object first, then permission set separately. Exclude required fields from FLS. Test CRUD before production. Use bulk script for permission set assignments."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: salesforce-plugin:sfdc-deployment-manager
---

# Custom Object With Permission Set Deployment

Deploy object first, then permission set separately. Exclude required fields from FLS. Test CRUD before production. Use bulk script for permission set assignments.

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- During data import or bulk operations

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Deploy object first, then permission set separately
2. Exclude required fields from FLS
3. Test CRUD before production
4. Use bulk script for permission set assignments

## Source

- **Reflection**: 254aae57-544a-4242-93b0-611609e3d540
- **Agent**: salesforce-plugin:sfdc-deployment-manager
- **Enriched**: 2026-04-03
