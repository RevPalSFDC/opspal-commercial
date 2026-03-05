# 01 - Canonical Lead Identity and Dedupe

## Goal

Resolve the canonical Marketo person record before any routing diagnosis.

## Why This Comes First

Routing failures frequently start with duplicate or forked lead identity. If diagnosis starts from the wrong lead ID, all downstream evidence is misleading.

## Procedure

1. Resolve lead by known key:
   - `mcp__marketo__lead_query({ filterType, filterValues, fields })`
2. If multiple leads are returned:
   - pick canonical lead using deterministic policy (ID or most recent update based on lookup mode)
   - mark duplicate risk in incident output
3. Snapshot routing-relevant fields:
   - owner/sync IDs
   - lifecycle/status flags
   - segmentation fields used by routing

## Evidence to Persist

- lookup filter and values
- all candidate lead IDs
- canonical selection method
- duplicate risk flag
