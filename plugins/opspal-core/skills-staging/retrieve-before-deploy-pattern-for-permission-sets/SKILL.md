---
name: retrieve-before-deploy-pattern-for-permission-sets
description: "ALWAYS: sf project retrieve start -m PermissionSet:NAME before modifying. NEVER create permission set XML from scratch for existing permission sets. Salesforce Metadata API does destructive overwrites - any fieldPermissions not in the XML get set to No Access."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Retrieve Before Deploy Pattern For Permission Sets

ALWAYS: sf project retrieve start -m PermissionSet:NAME before modifying. NEVER create permission set XML from scratch for existing permission sets. Salesforce Metadata API does destructive overwrites - any fieldPermissions not in the XML get set to No Access.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. ALWAYS: sf project retrieve start -m PermissionSet:NAME before modifying
2. NEVER create permission set XML from scratch for existing permission sets
3. Salesforce Metadata API does destructive overwrites - any fieldPermissions not in the XML get set to No Access

## Source

- **Reflection**: fa7ce0b1-d258-4c1c-ac0d-7b0834a0fae5
- **Agent**: manual
- **Enriched**: 2026-04-03
