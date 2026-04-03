---
name: bulk-job-status-verification
description: "When sf data upsert bulk returns non-zero exit code, GET /services/data/v62.0/jobs/ingest/{jobId} to check actual state, numberRecordsProcessed, numberRecordsFailed"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:direct execution
---

# Bulk Job Status Verification

When sf data upsert bulk returns non-zero exit code, GET /services/data/v62.0/jobs/ingest/{jobId} to check actual state, numberRecordsProcessed, numberRecordsFailed

## When to Use This Skill

- During data import or bulk operations

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. When sf data upsert bulk returns non-zero exit code, GET /services/data/v62
2. 0/jobs/ingest/{jobId} to check actual state, numberRecordsProcessed, numberRecordsFailed

## Source

- **Reflection**: 01b06248-68a4-4559-95cb-cce154402097
- **Agent**: direct execution
- **Enriched**: 2026-04-03
