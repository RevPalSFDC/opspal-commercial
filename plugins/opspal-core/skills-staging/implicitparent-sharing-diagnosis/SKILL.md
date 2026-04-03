---
name: implicitparent-sharing-diagnosis
description: "Query AccountShare → identify ImplicitParent RowCause → trace to OpportunityShare/ContactShare → identify source sharing rule → validate criteria → remediate"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-security-admin
---

# Implicitparent Sharing Diagnosis

Query AccountShare → identify ImplicitParent RowCause → trace to OpportunityShare/ContactShare → identify source sharing rule → validate criteria → remediate

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: [SFDC_ID]
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query AccountShare → identify ImplicitParent RowCause → trace to OpportunityShare/ContactShare → identify source sharing rule → validate criteria → remediate
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 092413b7-4c8c-4e8f-b0fb-99e9da211493
- **Agent**: sfdc-security-admin
- **Enriched**: 2026-04-03
