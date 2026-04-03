---
name: tooling-api-bulk-delete-via-curl
description: "Extract access token via sf org display --json, then parallel curl -X DELETE against /services/data/vXX.0/tooling/sobjects/{Object}/{Id}. Use xargs -P for parallelism. Verify with [COMPANY]() query afterward."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:parent-context (should have been sfdc-metadata-manager)
---

# Tooling Api Bulk Delete Via Curl

Extract access token via sf org display --json, then parallel curl -X DELETE against /services/data/vXX.0/tooling/sobjects/{Object}/{Id}. Use xargs -P for parallelism. Verify with [COMPANY]() query afterward.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Extract access token via sf org display --json, then parallel curl -X DELETE against /services/data/vXX
2. 0/tooling/sobjects/{Object}/{Id}
3. Use xargs -P for parallelism
4. Verify with [COMPANY]() query afterward

## Source

- **Reflection**: 055c82a5-83c0-46cf-94e0-573190e2e445
- **Agent**: parent-context (should have been sfdc-metadata-manager)
- **Enriched**: 2026-04-03
