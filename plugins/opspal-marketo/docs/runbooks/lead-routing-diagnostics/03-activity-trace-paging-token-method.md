# 03 - Activity Trace Paging Token Method

## Goal

Build a reliable, time-ordered runtime trace without false negatives from paging-token windowing.

## APIs

- `mcp__marketo__lead_activity_paging_token`
- `mcp__marketo__lead_activities`
- `mcp__marketo__analytics_lead_changes`
- `mcp__marketo__analytics_activity_trace_window`

## Procedure

1. Start from a narrow `sinceDatetime` near the incident window.
2. Fetch activities with `nextPageToken` and continue while `moreResult=true`.
3. Fetch lead changes in the same window and correlate field writes.
4. If target activity appears missing:
   - continue paging
   - run `analytics_activity_trace_window` to confirm window mismatch risk

## Known Trap

The activities endpoint scans a fixed window per token step. A target activity type can be absent in early pages even when it exists later. Do not stop at first empty page.

## Evidence to Persist

- paging start token
- pages scanned, empty pages, truncation status
- ordered activities + lead change timeline
