---
name: marketo-lead-routing-diagnostics
description: Deterministic API-first diagnostics for Marketo lead routing incidents, including identity resolution, membership snapshots, activity timeline reconstruction, race-condition detection, and safe remediation with audit payloads.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
---

# Marketo Lead Routing Diagnostics

## When to Use This Skill

- A lead qualified for MQL but was never handed off to sales and the routing path is unclear
- A lead appears in multiple conflicting campaign memberships simultaneously (daisy-chain conflict)
- A lead triggered the same campaign more than once and you suspect a routing loop
- Lead status transitions (MQL → SAL → SQL) are not firing in the expected sequence
- You need an API-first, audit-ready trace of exactly where in the routing flow a lead stalled

**Not for**: campaign-wide processing failures affecting many leads (use `marketo-campaign-diagnostics-framework`) or MQL handoff configuration (use `marketo-mql-handoff-framework`).

## Routing Failure Pattern Reference

| Pattern | Symptom | Diagnostic Tool |
|---------|---------|----------------|
| Identity split | Same person, two lead records | `mcp__marketo__lead_query` by email + phone |
| Membership gap | Lead not in expected Smart List | `mcp__marketo__lead_smart_campaign_membership` |
| Race condition | Two campaigns firing simultaneously | `mcp__marketo__analytics_loop_detector` |
| Flow step skip | Lead jumped from step 1 to step 4 | `mcp__marketo__lead_activities` timeline |
| Partition mismatch | Lead visible in wrong workspace | `mcp__marketo__lead_list_membership` |
| Score threshold miss | Score computed but MQL not triggered | `mcp__marketo__lead_query` on score field value |

## Workflow

1. **Resolve canonical identity**: query the lead by email and any known alternate identifiers; confirm there is a single canonical lead record and no shadow duplicates.
2. **Snapshot memberships**: capture current campaign and list memberships via `mcp__marketo__lead_smart_campaign_membership` and `mcp__marketo__lead_program_membership`.
3. **Reconstruct activity timeline**: call `mcp__marketo__analytics_activity_trace_window` for the relevant time window; build a chronological sequence of status changes, score updates, and flow step executions.
4. **Correlate Smart List rules**: for each campaign the lead was expected to enter, retrieve the Smart List via `mcp__marketo__campaign_get_smart_list` and verify the lead meets all filter criteria at the relevant timestamp.
5. **Detect race and loop patterns**: run `mcp__marketo__analytics_loop_detector` with the routing field (e.g., `leadStatus`) to identify any campaigns firing in a conflicting cycle.
6. **Apply safe remediation**: present the specific gap or conflict with evidence; propose the targeted fix (field correction, list add, campaign re-enrollment) and require approval before executing any write.
7. **Produce audit payload**: generate a structured record of findings, root cause, remediation taken, and verification result for the governance log.

## Routing Boundaries

Use this skill for lead-level routing path analysis and remediation.
Use `marketo-campaign-diagnostics-framework` for broader campaign health incidents affecting many leads.

## References

- [canonical trace sequence](./canonical-trace-sequence.md)
- [race and loop detection](./race-loop-detection.md)
- [remediation and audit payload](./remediation-audit.md)
