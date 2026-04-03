---
name: sparse-csv-field-splitter
description: "When enrichment data has different fields populated per record, group records by field combination and generate separate CSVs to avoid Bulk API blanking existing values"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
---

# Sparse Csv Field Splitter

When enrichment data has different fields populated per record, group records by field combination and generate separate CSVs to avoid Bulk API blanking existing values

## When to Use This Skill

- During data import or bulk operations

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When enrichment data has different fields populated per record, group records by field combination and generate separate CSVs to avoid Bulk API blanking existing values
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 15175270-9c09-41a2-a3cc-bc82714eb049
- **Agent**: manual discovery during enrichment upload
- **Enriched**: 2026-04-03
