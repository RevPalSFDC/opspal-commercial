---
name: report-to-bulk-update-pipeline
description: "Extract record IDs from a Salesforce report via Analytics API, apply filter criteria, then batch-update a field (e.g., OwnerId) on matching records"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-bulkops-orchestrator
---

# Report To Bulk Update Pipeline

Extract record IDs from a Salesforce report via Analytics API, apply filter criteria, then batch-update a field (e.g., OwnerId) on matching records

## When to Use This Skill

- When building or modifying reports and dashboards

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. Extract record IDs from a Salesforce report via Analytics API, apply filter criteria, then batch-update a field (e
2. , OwnerId) on matching records

## Source

- **Reflection**: 957062df-6dbe-4e00-9204-accd09a1e67c
- **Agent**: sfdc-bulkops-orchestrator
- **Enriched**: 2026-04-03
