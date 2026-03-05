# OpsPal Documentation Trust Digest

Source Fingerprint: `305808dbe315d5f1`

## Trust Status
- Narrative drift status: PASS (0 metric drift rows detected).
- Manifest alignment status: PASS (no manifest mismatches detected).

## Approved Source-of-Truth Pointers

| Artifact | Purpose |
|---|---|
| `docs/PLUGIN_SUITE_CATALOG.json` | Canonical machine-readable plugin inventory and totals. |
| `docs/PLUGIN_SUITE_CATALOG.md` | Canonical human-readable plugin inventory and lifecycle context. |
| `docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md` | Ownership, lifecycle status, and review accountability source. |
| `reports/exec/opspal-capability-vs-ai-maturity.md` | Executive capability baseline including narrative drift signals. |
| `reports/exec/opspal-gap-priority-matrix.csv` | Ranked opportunity scoring baseline for initiative prioritization. |
| `reports/exec/opspal-90-day-initiatives.md` | Funded initiative plan derived from the scoring baseline. |
| `reports/exec/opspal-90-day-execution-board.md` | Sprint timeline and KPI gates for the 90-day plan. |
| `reports/exec/opspal-sprint6-executive-readout.md` | Sprint 6 executive outcome summary with KPI deltas and phase-2 recommendations. |

## Release-Blocking Guardrails
- Local blocking command: `npm run exec:validate`
- CI blocking command: `npm run exec:ci`
- Workflow gate: `.github/workflows/exec-gap-analysis-check.yml`

## Current Narrative Drift Detail
_No drift detected._
