---
name: dynamic-dashboard-detection-via-soql-type-field
description: "Use WHERE Type = 'LoggedInUser' on Dashboard SOQL to identify dashboards running as logged-in user"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-query-specialist
---

# Dynamic Dashboard Detection Via Soql Type Field

Use WHERE Type = 'LoggedInUser' on Dashboard SOQL to identify dashboards running as logged-in user

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use WHERE Type = 'LoggedInUser' on Dashboard SOQL to identify dashboards running as logged-in user
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 882e3ac5-b0c2-4f34-ab3d-cc094d1a4481
- **Agent**: sfdc-query-specialist
- **Enriched**: 2026-04-03
