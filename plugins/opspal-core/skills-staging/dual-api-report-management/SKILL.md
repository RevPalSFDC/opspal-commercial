---
name: dual-api-report-management
description: "Use Analytics REST API for reportMetadata (columns, groupings, filters) but Metadata API XML for chart configuration — the two APIs have non-overlapping coverage"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-reports-dashboards
---

# Dual Api Report Management

Use Analytics REST API for reportMetadata (columns, groupings, filters) but Metadata API XML for chart configuration — the two APIs have non-overlapping coverage

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Use Analytics REST API for reportMetadata (columns, groupings, filters) but Metadata API XML for chart configuration — the two APIs have non-overlapping coverage
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: e2b86f4b-9844-4e7e-84f7-76288bf0c4b6
- **Agent**: sfdc-reports-dashboards
- **Enriched**: 2026-04-03
