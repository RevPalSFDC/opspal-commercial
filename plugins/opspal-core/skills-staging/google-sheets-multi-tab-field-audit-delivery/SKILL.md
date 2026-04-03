---
name: google-sheets-multi-tab-field-audit-delivery
description: "Parse markdown audit report into structured data, create Google Sheet with categorized tabs (Summary, Layouts, Zero/Low/Med/High population, Orphans, Dependencies), and enrich with cross-reference data from subsequent analyses"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-core:operator
---

# Google Sheets Multi Tab Field Audit Delivery

Parse markdown audit report into structured data, create Google Sheet with categorized tabs (Summary, Layouts, Zero/Low/Med/High population, Orphans, Dependencies), and enrich with cross-reference data from subsequent analyses

## When to Use This Skill

- When performing audits or assessments of the target system
- When building or modifying reports and dashboards

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Parse markdown audit report into structured data, create Google Sheet with categorized tabs (Summary, Layouts, Zero/Low/Med/High population, Orphans, Dependencies), and enrich with cross-reference data from subsequent analyses
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 04799434-c782-4aeb-86c1-73c7512c17a4
- **Agent**: operator
- **Enriched**: 2026-04-03
