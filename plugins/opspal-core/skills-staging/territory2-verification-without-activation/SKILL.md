---
name: territory2-verification-without-activation
description: "Verify Territory2 structure in Planning state by checking: (1) No Account.OwnerId changes, (2) No AccountTeamMember changes, (3) Territory2 records queryable, (4) Assignment rules created with correct associations. This allows safe validation before activation."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-orchestrator
---

# Territory2 Verification Without Activation

Verify Territory2 structure in Planning state by checking: (1) No Account.OwnerId changes, (2) No AccountTeamMember changes, (3) Territory2 records queryable, (4) Assignment rules created with correct associations. This allows safe validation before activation.

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify Territory2 structure in Planning state by checking: (1) No Account
2. OwnerId changes, (2) No AccountTeamMember changes, (3) Territory2 records queryable, (4) Assignment rules created with correct associations
3. This allows safe validation before activation

## Source

- **Reflection**: 0ef91656-422b-4294-930e-a63e4188d20d
- **Agent**: sfdc-orchestrator
- **Enriched**: 2026-04-03
