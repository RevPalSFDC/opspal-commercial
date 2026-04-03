---
name: inactive-user-license-workaround
description: "Create users as inactive (IsActive=false) when license pool is exhausted, allowing pre-configuration of role, profile, and permission sets for later activation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-security-admin
---

# Inactive User License Workaround

Create users as inactive (IsActive=false) when license pool is exhausted, allowing pre-configuration of role, profile, and permission sets for later activation

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Create users as inactive (IsActive=false) when license pool is exhausted, allowing pre-configuration of role, profile, and permission sets for later activation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a35581bc-be50-4488-90d7-565f80e089b5
- **Agent**: sfdc-security-admin
- **Enriched**: 2026-04-03
