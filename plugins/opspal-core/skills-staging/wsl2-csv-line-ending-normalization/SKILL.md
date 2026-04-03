---
name: wsl2-csv-line-ending-normalization
description: "When generating CSVs on WSL2 for Salesforce Bulk API, always use explicit LF line endings in Python csv.writer. Verify with file command before upload."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Wsl2 Csv Line Ending Normalization

When generating CSVs on WSL2 for Salesforce Bulk API, always use explicit LF line endings in Python csv.writer. Verify with file command before upload.

## When to Use This Skill

- Before executing the operation described in this skill
- During data import or bulk operations

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. When generating CSVs on WSL2 for Salesforce Bulk API, always use explicit LF line endings in Python csv
2. Verify with file command before upload

## Source

- **Reflection**: 4711bd48-617c-4019-8097-596bca673f9d
- **Agent**: manual-execution
- **Enriched**: 2026-04-03
