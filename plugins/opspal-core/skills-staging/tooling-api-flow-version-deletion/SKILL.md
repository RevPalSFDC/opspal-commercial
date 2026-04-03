---
name: tooling-api-flow-version-deletion
description: "Query Flow object via Tooling API REST, iterate through non-Active versions, DELETE each by Id. Managed package versions will fail gracefully."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Tooling Api Flow Version Deletion

Query Flow object via Tooling API REST, iterate through non-Active versions, DELETE each by Id. Managed package versions will fail gracefully.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Query Flow object via Tooling API REST, iterate through non-Active versions, DELETE each by Id
2. Managed package versions will fail gracefully

## Source

- **Reflection**: 2f310a1e-c2c6-495b-a72f-bfb5307b9011
- **Agent**: manual/user-provided
- **Enriched**: 2026-04-03
