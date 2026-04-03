---
name: marketo-salesforce-sync-verification
description: "Check for sfdcId, sfdcLeadId, sfdcContactId, sfdcAccountId fields in Marketo lead schema to confirm SFDC sync is active"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-marketo:marketo-instance-discovery
---

# Marketo Salesforce Sync Verification

Check for sfdcId, sfdcLeadId, sfdcContactId, sfdcAccountId fields in Marketo lead schema to confirm SFDC sync is active

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Check for sfdcId, sfdcLeadId, sfdcContactId, sfdcAccountId fields in Marketo lead schema to confirm SFDC sync is active
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 1ca87d16-fd98-4e23-8ddb-78813e3665eb
- **Agent**: marketo-instance-discovery
- **Enriched**: 2026-04-03
