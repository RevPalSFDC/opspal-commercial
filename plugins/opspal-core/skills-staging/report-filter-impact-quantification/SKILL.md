---
name: report-filter-impact-quantification
description: "When a data change (backfill, automation) is suspected of impacting pipeline reports, fetch the report describe API, extract filter logic, and cross-reference against the changed records to quantify exact impact in dollar terms."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:direct-execution
---

# Report Filter Impact Quantification

When a data change (backfill, automation) is suspected of impacting pipeline reports, fetch the report describe API, extract filter logic, and cross-reference against the changed records to quantify exact impact in dollar terms.

## When to Use This Skill

- When working with Salesforce Flows or automation
- When building or modifying reports and dashboards

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When a data change (backfill, automation) is suspected of impacting pipeline reports, fetch the report describe API, extract filter logic, and cross-reference against the changed records to quantify exact impact in dollar terms.
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: b9e041c7-317e-48da-9419-d0ccf1431892
- **Agent**: direct-execution
- **Enriched**: 2026-04-03
