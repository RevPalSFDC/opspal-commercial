---
name: dual-endpoint-hubspot-workflow-audit
description: "Query V4 for workflow enumeration, V3 for accurate enabled status, merge by ID to get true active count"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-okrs:okr-data-aggregator
---

# Dual Endpoint Hubspot Workflow Audit

Query V4 for workflow enumeration, V3 for accurate enabled status, merge by ID to get true active count

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: query
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Query V4 for workflow enumeration, V3 for accurate enabled status, merge by ID to get true active count
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 745e188e-2fdb-494a-9e98-859dac6b7a28
- **Agent**: opspal-okrs:okr-data-aggregator
- **Enriched**: 2026-04-03
