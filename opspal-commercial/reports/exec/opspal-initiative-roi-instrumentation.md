# OpsPal Initiative ROI Instrumentation Layer

Source Fingerprint: `305808dbe315d5f1`

## Objective
Standardize baseline/target KPI tracking for funded initiatives so executives can measure 90-day plan outcomes consistently.

## Measurement Window
- Start: `2026-02-14`
- End: `2026-05-07`
- Cadence: `bi-weekly`

## Initiative Coverage

| Initiative | Linked Opportunity | Title | Owner | Risk | 90-Day Fit | Score |
|---|---|---|---|---|---|---:|
| `INIT-A` | `OPP-001` | Documentation Trust Layer | `revpal-platform` | `medium` | `yes` | 4.06 |
| `INIT-B` | `OPP-003` | Copilot Approval Queue | `revpal-platform` | `critical` | `yes` | 4.4 |
| `INIT-C` | `OPP-009` | Unified Next-Best-Action Layer | `revpal-platform` | `high` | `yes` | 4.2 |
| `INIT-D` | `OPP-002` | AI Maturity Uplift Pack | `revpal-platform` | `medium` | `conditional` | 3.7 |
| `INIT-E` | `OPP-004` | Command Telemetry Contract Adoption | `revpal-platform` | `high` | `conditional` | 3.88 |

## KPI Baseline and Target Registry

| Initiative | Metric ID | Metric | Unit | Baseline | Target | Direction | Data Source | Reporting Artifact |
|---|---|---|---|---:|---:|---|---|---|
| `INIT-A` | `doc_drift_rows` | Documentation narrative drift rows | `count` | 0 | 0 | `down` | `reports/exec/opspal-capability-vs-ai-maturity.md` | `reports/exec/opspal-documentation-trust-digest.md` |
| `INIT-B` | `approval_gated_recommendation_coverage` | High-risk recommendations routed through approval gate | `ratio` | 0 | 1 | `up` | `reports/exec/opspal-next-best-actions.json` | `reports/exec/runtime/opspal-approved-work-items.json` |
| `INIT-C` | `ranked_action_adoption_rate` | Top-ranked actions accepted into execution queue | `ratio` | 0.25 | 0.7 | `up` | `reports/exec/opspal-next-best-actions.json` | `reports/exec/runtime/opspal-approved-work-items.json` |
| `INIT-D` | `ai_enabled_ratio_lowest_three_plugins` | Average AI-enabled ratio across lowest-coverage active plugins | `ratio` | 0.038 | 0.188 | `up` | `reports/exec/opspal-ai-maturity-uplift-pack.md` | `reports/exec/opspal-capability-vs-ai-maturity.md` |
| `INIT-E` | `telemetry_contract_coverage` | High-volume command coverage for telemetry contract | `ratio` | 0 | 0.8 | `up` | `docs/contracts/opspal-command-telemetry-contract.schema.json` | `reports/exec/strategy-dashboard-portfolio.json` |

## Instrumentation Rules
- Each funded initiative must publish at least one KPI with explicit baseline and target.
- KPI updates should be published on the bi-weekly sprint cadence.
- Release validation remains blocked by `npm run exec:validate` when ROI artifacts are missing or malformed.

## Execution Readiness Snapshot
- KPI contract coverage: 5/5 (ratio 1)
- Initiatives with metrics: 5/5
- Execution checklist detected: `yes`
- Execution checklist path: `reports/exec/runtime/wi-nba-opp-011-execution-checklist.md`
- Strategy dashboard payload detected: `yes`
- Strategy dashboard payload path: `reports/exec/strategy-dashboard-portfolio.json`
- KPI contract ready: `yes`
- Runtime handoff ready: `yes`
- Ready for phase-2 reporting: `yes`
