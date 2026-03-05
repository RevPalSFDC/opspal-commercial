---
name: soql-large-result-paging-framework
description: Handle large Salesforce query result sets safely using LIMIT, pagination, and chunked extraction workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# soql-large-result-paging-framework

Use this skill when implementing or reviewing hook safeguards for this protection area.

## Workflow

1. Detect risk signals and map them to concrete thresholds.
2. Apply block/warn/fallback behavior with deterministic output shaping.
3. Verify with explicit before/after checks and negative-path tests.

## References

- [Query Sizing Signals](./query-sizing-signals.md)
- [Paging Strategy](./paging-strategy.md)
- [Verification and Replay](./verification-and-replay.md)
