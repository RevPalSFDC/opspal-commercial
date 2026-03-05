# OpsPal Cross-Model Consultation Expansion Pack

Source Fingerprint: `305808dbe315d5f1`

## Objective
Expand cross-model consultation beyond `opspal-ai-consult` by attaching standardized consultation contracts to high-value diagnose/recommend routes.

## Consultation Baseline
- Focus plugin detected: `yes`
- Focus plugin owner: `revpal-ai`
- Focus plugin status: `active`
- Focus plugin commands: 3
- Focus plugin agents: 2

## Consumer Target Prioritization

| Rank | Plugin | Owner | Commands | Agents | Recommend Assets | AI-Enabled Assets | Integration Score | Priority | Launch Wave |
|---:|---|---|---:|---:|---:|---:|---:|---|---|
| 1 | `opspal-core` | `revpal-platform` | 90 | 65 | 29 | 33 | 44.4 | `high` | `wave_1` |
| 2 | `opspal-salesforce` | `revpal-salesforce` | 60 | 94 | 22 | 26 | 38.2 | `high` | `wave_1` |
| 3 | `opspal-hubspot` | `revpal-hubspot` | 34 | 59 | 7 | 14 | 17.2 | `high` | `wave_1` |
| 4 | `opspal-marketo` | `revpal-marketing-ops` | 30 | 30 | 2 | 10 | 13.4 | `medium` | `wave_2` |
| 5 | `opspal-gtm-planning` | `revpal-gtm` | 15 | 12 | 13 | 0 | 11.6 | `medium` | `wave_2` |

## Rollout Plan

| Phase | Scope | Objective | Success Gate |
|---|---|---|---|
| `phase_1` | wave_1 consumer plugins | Attach cross-model consultation to diagnosis/recommendation outputs in highest-value routes. | >=80% of wave_1 recommendations include consult summary with confidence. |
| `phase_2` | wave_2 consumer plugins | Extend consultation contracts to medium-priority workflows with deterministic fallback. | >=60% of wave_2 recommendation routes are consultation-enabled. |
| `phase_3` | suite-wide governance | Standardize consultation telemetry fields for executive rollups. | Consultation override + acceptance metrics available in dashboard portfolio feed. |

## Guardrails
- Consultation output must include confidence and fallback rationale before promotion.
- Production-impacting recommendations remain approval-gated by risk class.
- Consultation telemetry should capture acceptance, override, and rework indicators.

## Success KPI Baselines

| Metric | Baseline | Target | Unit |
|---|---:|---:|---|
| `consultation_coverage_wave_1` | 0 | 0.8 | `ratio` |
| `consultation_coverage_wave_2` | 0 | 0.6 | `ratio` |
| `consultation_acceptance_rate` | 0 | 0.7 | `ratio` |

## Execution Snapshot
- Consumer targets: 5 (high priority: 3)
- Model providers: 2
- Rollout phases: 3
- Guardrails: 3
- Success KPIs: 3
- Runtime checklist detected: `yes`
- Runtime checklist path: `reports/exec/runtime/wi-nba-opp-008-execution-checklist.md`
- Package contract ready: `yes`
- Runtime handoff ready: `yes`
- Ready for phase-2 execution: `yes`
