---
name: sfdc-metric-validation-pattern
description: "Query SFDC directly with same filters as report, compare each metric type (total, breakdown, per-user), identify discrepancies by systematic comparison"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:direct execution
---

# Sfdc Metric Validation Pattern

Query SFDC directly with same filters as report, compare each metric type (total, breakdown, per-user), identify discrepancies by systematic comparison

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query SFDC directly with same filters as report, compare each metric type (total, breakdown, per-user), identify discrepancies by systematic comparison
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: ae22f08b-0c57-449e-99ff-919fad58e8a1
- **Agent**: direct execution
- **Enriched**: 2026-04-03
