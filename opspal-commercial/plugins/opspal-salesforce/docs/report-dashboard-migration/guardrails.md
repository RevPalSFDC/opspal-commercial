# Migration Guardrails (Semantic Drift)

## Purpose

Map semantic drift taxonomy to automated checks and enforcement guidance.

## Guardrail Matrix

| Taxonomy Category | Primary Checks | Evidence Type | Recommended Action |
| --- | --- | --- | --- |
| Definition Drift | Formula diff, aggregate type change, field substitution | Metadata | Require review |
| Filter Drift | Filter operator/value/logic diff | Metadata | Require review |
| Time Drift | Date filter translation, fiscal vs calendar mismatch | Metadata + runtime | Require review |
| Population Drift | Report type change, join path change | Metadata + runtime | Require review |
| Data Truncation / Limits | Row limit changes, summary >2k risk, row count deltas | Runtime | Block (if high confidence) |
| Trust & UX Drift | Component count/type diff, missing key charts | Metadata | Require review |

## Enforcement Guidelines

- **Block** only when confidence is high (metadata + runtime evidence) and drift is critical.
- **Require review** for high/medium drift in executive or finance dashboards.
- **Log only** for low-severity changes or Tier 0 personal reports.

## Recommended Workflow

1. Run semantic diff for each migrated report/dashboard.
2. Collect runtime evidence for key KPIs (row count + totals).
3. Apply guardrails above and record outcome in migration notes.
