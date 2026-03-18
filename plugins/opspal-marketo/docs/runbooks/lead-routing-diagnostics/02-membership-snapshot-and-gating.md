# 02 - Membership Snapshot and Gating

## Goal

Capture current list/program/campaign membership state that may gate or suppress routing.

## APIs

- `mcp__marketo__lead_list_membership`
- `mcp__marketo__lead_program_membership`
- `mcp__marketo__lead_smart_campaign_membership`

## Procedure

1. Fetch list memberships for suppression/staging/routed markers.
2. Fetch program memberships and progression status.
3. Fetch smart campaign memberships to detect prior-qualification effects.
4. Page until completion (or explicit page cap with truncation flag).

## Interpretation

- Already in campaign + once-only qualification can block retries.
- Program progression mismatch often indicates status flow failure.
- Suppression list membership can explain non-entry despite valid trigger activity.

## Evidence to Persist

- complete membership snapshots (or truncated flag + nextPageToken)
- candidate gating assets and why they matter
