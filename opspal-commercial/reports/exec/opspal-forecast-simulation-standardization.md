# OpsPal Forecast and Simulation Standardization Pack

Source Fingerprint: `305808dbe315d5f1`

## Objective
Standardize forecast and simulation outputs across GTM planning, HubSpot, and Core into one reusable scenario contract.

## Scope Coverage
- Readiness status: `standardization_ready`
- Scope plugins: 3
- Plugins with simulation coverage: 3
- Simulation coverage ratio: 1

| Plugin | Owner | Status | Commands | Agents | Simulate Assets | Verify Assets | Recommend Assets |
|---|---|---|---:|---:|---:|---:|---:|
| `opspal-gtm-planning` | `revpal-gtm` | `active` | 15 | 12 | 12 | 10 | 13 |
| `opspal-hubspot` | `revpal-hubspot` | `active` | 34 | 59 | 5 | 29 | 7 |
| `opspal-core` | `revpal-platform` | `active` | 90 | 65 | 4 | 102 | 29 |

## Standard Scenario Contract

| Field | Type | Required | Description |
|---|---|---|---|
| `scenario_id` | `string` | `yes` | Stable unique identifier for each scenario run. |
| `scenario_horizon_days` | `number` | `yes` | Forecast horizon in days. |
| `assumptions` | `array<string>` | `yes` | Explicit scenario assumptions used by model/rules engine. |
| `confidence` | `number` | `yes` | Normalized confidence score in [0,1]. |
| `projected_delta` | `number` | `yes` | Expected positive/negative delta against baseline metric. |
| `recommended_actions` | `array<object>` | `yes` | Ranked follow-up actions linked to scenario outcomes. |

## Confidence Bands

| Band | Min | Max | Action |
|---|---:|---:|---|
| `high` | 0.8 | 1 | allow direct recommendation packaging |
| `medium` | 0.6 | 0.79 | require consultation + reviewer confirmation |
| `low` | 0 | 0.59 | fallback to deterministic baseline guidance |

## Blocking Gaps
- None. Scope plugins meet current standardization gates.

## Recommended Next Steps
1. Adopt the shared forecast/simulation contract fields in dashboard and next-best-action outputs.

## Execution Snapshot
- Contract fields: 6
- Confidence bands: 3
- Output artifacts: 2
- Scope plugins detected: 3/3
- Plugins with simulation: 3
- Plugins with verify: 3
- Runtime checklist detected: `yes`
- Runtime checklist path: `reports/exec/runtime/wi-nba-opp-010-execution-checklist.md`
- Package contract ready: `yes`
- Runtime handoff ready: `yes`
- Ready for phase-2 execution: `yes`
