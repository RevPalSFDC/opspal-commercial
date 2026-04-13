---
name: soql-large-result-paging-framework
description: Handle large Salesforce query result sets safely using LIMIT, pagination, and chunked extraction workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# SOQL Large Result Paging

## When to Use This Skill

Use this skill when:
- A query may return more than 2,000 records
- Building data export or migration workflows for large datasets
- Choosing between REST pagination, Bulk API, and LIMIT/OFFSET
- Preventing API limit exhaustion from unbounded queries

**Not for**: Query safety validation (use `salesforce-query-safety-framework`), API quota monitoring (use `salesforce-runtime-telemetry-and-api-quota-framework`), or query performance tuning (use `performance-optimization-guide`).

## Paging Strategy Decision Tree

| Expected Records | Strategy | Notes |
|------------------|----------|-------|
| <200 | Single SOQL query | Default `sf data query` |
| 200-2,000 | SOQL with LIMIT | Add `ORDER BY Id` |
| 2,000-50,000 | REST `nextRecordsUrl` pagination | CLI handles automatically |
| 50,000+ | Bulk API v2 query job | `sf data query --bulk` |

## Key Patterns

```bash
# REST pagination (CLI handles nextRecordsUrl automatically)
sf data query --query "SELECT Id, Name FROM Account ORDER BY Id" --target-org <org>

# Bulk API for large exports
sf data query --query "SELECT Id, Name, Industry FROM Account" --target-org <org> --bulk --wait 10

# LIMIT/OFFSET (max OFFSET is 2,000)
# Page 1: SELECT Id FROM Account ORDER BY Id LIMIT 200 OFFSET 0
# Page 2: SELECT Id FROM Account ORDER BY Id LIMIT 200 OFFSET 200
```

## Safety Rules

- Always include `ORDER BY Id` when paginating (deterministic page boundaries)
- Always estimate size first with `SELECT COUNT()` before large queries
- Never use OFFSET > 2,000 (Salesforce hard limit)
- Prefer Bulk API over REST pagination for exports > 50,000 records

## References

- [Query Sizing Signals](./query-sizing-signals.md)
- [Paging Strategy](./paging-strategy.md)
- [Verification and Replay](./verification-and-replay.md)
