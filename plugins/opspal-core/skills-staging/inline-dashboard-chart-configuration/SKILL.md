---
name: inline-dashboard-chart-configuration
description: "When creating dashboard chart components, use useReportChart=false with inline <chartSummary> (aggregate, axisBinding, column) and explicit <groupingColumn> elements to avoid dependency on report chart definitions"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-metadata
---

# Inline Dashboard Chart Configuration

When creating dashboard chart components, use useReportChart=false with inline <chartSummary> (aggregate, axisBinding, column) and explicit <groupingColumn> elements to avoid dependency on report chart definitions

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When creating dashboard chart components, use useReportChart=false with inline <chartSummary> (aggregate, axisBinding, column) and explicit <groupingColumn> elements to avoid dependency on report chart definitions
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 13c9b2ca-2b30-4703-bc49-b13a57b5fab1
- **Agent**: sfdc-metadata
- **Enriched**: 2026-04-03
