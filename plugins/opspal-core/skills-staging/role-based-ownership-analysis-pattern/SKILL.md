---
name: role-based-ownership-analysis-pattern
description: "Three-step extraction process: (1) Query User with UserRole filtering to identify role members, (2) Query owned objects using OwnerId IN filter, (3) Query History object to track assignment dates. Combine results with AM metadata for comprehensive ownership reports including identifiers, business data, and tenure metrics. Generate both detailed records and summary statistics for actionable insights."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct-implementation
---

# Role Based Ownership Analysis Pattern

Three-step extraction process: (1) Query User with UserRole filtering to identify role members, (2) Query owned objects using OwnerId IN filter, (3) Query History object to track assignment dates. Combine results with AM metadata for comprehensive ownership reports including identifiers, business data, and tenure metrics. Generate both detailed records and summary statistics for actionable insights.

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Three-step extraction process: (1) Query User with UserRole filtering to identify role members, (2) Query owned objects using OwnerId IN filter, (3) Query History object to track assignment dates
2. Combine results with AM metadata for comprehensive ownership reports including identifiers, business data, and tenure metrics
3. Generate both detailed records and summary statistics for actionable insights

## Source

- **Reflection**: b3916d6e-3bf3-480a-ac8c-b9ccbd4d44f2
- **Agent**: direct-implementation
- **Enriched**: 2026-04-03
