---
name: live-state-verification
description: "Always query live Salesforce org for entity status before reporting, compare against documentation if available"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-discovery
---

# Live State Verification

Always query live Salesforce org for entity status before reporting, compare against documentation if available

## When to Use This Skill

- Before executing the operation described in this skill
- When building or modifying reports and dashboards

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Always query live Salesforce org for entity status before reporting, compare against documentation if available
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 627c3048-baec-4fe9-9a23-b338d1557682
- **Agent**: sfdc-territory-discovery
- **Enriched**: 2026-04-03
