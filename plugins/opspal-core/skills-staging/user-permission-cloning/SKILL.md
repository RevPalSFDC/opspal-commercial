---
name: user-permission-cloning
description: "Query source user PS assignments, create new user, bulk-assign matching PSes with error categorization (OK/DUPE/SKIP/FAIL)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-security-admin
---

# User Permission Cloning

Query source user PS assignments, create new user, bulk-assign matching PSes with error categorization (OK/DUPE/SKIP/FAIL)

## When to Use This Skill

- During data import or bulk operations
- When encountering errors that match this pattern

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query source user PS assignments, create new user, bulk-assign matching PSes with error categorization (OK/DUPE/SKIP/FAIL)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: f549d0d0-da70-45ea-9e2e-a4064aa912c1
- **Agent**: opspal-salesforce:sfdc-security-admin
- **Enriched**: 2026-04-03
