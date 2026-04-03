---
name: group-based-access-provisioning
description: "Lookup group -> verify membership -> add GroupMember records -> verify UserRecordAccess. Reusable for any sharing-rule-based access provisioning."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-data-operations
---

# Group Based Access Provisioning

Lookup group -> verify membership -> add GroupMember records -> verify UserRecordAccess. Reusable for any sharing-rule-based access provisioning.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Lookup group -> verify membership -> add GroupMember records -> verify UserRecordAccess
2. Reusable for any sharing-rule-based access provisioning

## Source

- **Reflection**: 5e971cf8-192f-4864-ab31-aad3d9e95fa9
- **Agent**: sfdc-data-operations
- **Enriched**: 2026-04-03
