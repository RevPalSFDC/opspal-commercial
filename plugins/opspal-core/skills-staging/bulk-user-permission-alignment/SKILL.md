---
name: bulk-user-permission-alignment
description: "Query reference user config, diff against target users, bulk update profile/role/permission sets, verify alignment"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-permission-orchestrator
---

# Bulk User Permission Alignment

Query reference user config, diff against target users, bulk update profile/role/permission sets, verify alignment

## When to Use This Skill

- During data import or bulk operations

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query reference user config, diff against target users, bulk update profile/role/permission sets, verify alignment
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 2892a17a-47a0-4017-83fb-b89fc060234d
- **Agent**: sfdc-permission-orchestrator
- **Enriched**: 2026-04-03
