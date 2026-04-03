---
name: same-day-close-opportunity-analysis
description: "SOQL query using DAY_ONLY(CreatedDate) = CloseDate to identify opportunities created and closed on the same day, with GROUP BY owner for repeat offender analysis"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-query-specialist
---

# Same Day Close Opportunity Analysis

SOQL query using DAY_ONLY(CreatedDate) = CloseDate to identify opportunities created and closed on the same day, with GROUP BY owner for repeat offender analysis

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: SOQL query using DAY_ONLY(CreatedDate) = CloseDate to identify opportunities created and closed on the same day, with GROUP BY owner for repeat offender analysis
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: c80df080-e3bb-4f7d-8c89-4117d644b7a8
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
