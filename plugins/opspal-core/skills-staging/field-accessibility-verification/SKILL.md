---
name: field-accessibility-verification
description: "Use direct Apex SOQL execution to verify field accessibility rather than Tooling API [SFDC_ID] queries which may return stale/incomplete results"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-metadata-manager
---

# Field Accessibility Verification

Use direct Apex SOQL execution to verify field accessibility rather than Tooling API [SFDC_ID] queries which may return stale/incomplete results

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use direct Apex SOQL execution to verify field accessibility rather than Tooling API [SFDC_ID] queries which may return stale/incomplete results
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: afae6a79-3839-418b-bd05-498a5b44cc24
- **Agent**: sfdc-metadata-manager
- **Enriched**: 2026-04-03
