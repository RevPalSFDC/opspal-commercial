# OpsPal Monday Graduation Readiness Pack

Source Fingerprint: `305808dbe315d5f1`

## Readiness Status
- Focus plugin: `opspal-monday`
- Status: `needs_remediation`
- Readiness score: `0.57`
- Experimental plugins in suite: 1

## Plugin Snapshot

| Status | Owner | Stability | Version | Last Reviewed |
|---|---|---|---|---|
| `experimental` | `revpal-experimental` | `experimental` | `1.4.4` | `2026-02-15` |

| Agents | Commands | Skills | Hooks | Scripts | Mandatory Agents |
|---:|---:|---:|---:|---:|---:|
| 6 | 1 | 1 | 0 | 3 | 0 |

## Workflow and Maturity Coverage

| Detect | Diagnose | Recommend | Simulate | Execute | Verify | Learn |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4 | 0 | 0 | 4 | 0 | 1 |

| Rules-Based | LLM-Assisted | Closed-Loop | Autonomous | AI-Enabled Ratio |
|---:|---:|---:|---:|---:|
| 8 | 0 | 0 | 0 | 0 |

## Graduation Gate Scorecard

| Gate | Description | Threshold | Current Value | Result |
|---|---|---|---|---|
| `lifecycle_metadata_complete` | Status, owner, stability, and last reviewed fields are populated. | `all_present` | `complete` | `pass` |
| `owner_assigned` | Plugin owner is explicitly assigned for graduation accountability. | `owner_not_unset` | `revpal-experimental` | `pass` |
| `command_surface_minimum` | Plugin has at least 2 user-facing commands before graduation. | `>=2` | `1` | `fail` |
| `ai_enabled_ratio_minimum` | AI-enabled maturity ratio (llm_assisted + closed_loop_learning + autonomous_execution) meets minimum threshold. | `>=0.15` | `0` | `fail` |
| `execute_stage_coverage` | Workflow execute-stage coverage exists in plugin assets. | `>=1` | `4` | `pass` |
| `verify_stage_coverage` | Workflow verify-stage coverage exists in plugin assets. | `>=1` | `0` | `fail` |
| `review_recency` | Lifecycle review is fresh within 45 days of plan baseline. | `<=45_days` | `0_days` | `pass` |

## Blocking Gaps
- `command_surface_minimum`: Plugin has at least 2 user-facing commands before graduation. (threshold `>=2`, current `1`)
- `ai_enabled_ratio_minimum`: AI-enabled maturity ratio (llm_assisted + closed_loop_learning + autonomous_execution) meets minimum threshold. (threshold `>=0.15`, current `0`)
- `verify_stage_coverage`: Workflow verify-stage coverage exists in plugin assets. (threshold `>=1`, current `0`)

## Execution Snapshot
- Gate progress: 4/7 passing (failing: 3)
- Runtime checklist detected: `yes`
- Runtime checklist path: `reports/exec/runtime/wi-nba-opp-006-execution-checklist.md`
- Readiness contract ready: `yes`
- Blocker reporting ready: `yes`
- Runtime handoff ready: `yes`
- Ready for phase-2 execution: `yes`

## Recommended Next Steps
1. Add at least one additional monday command with docs/validation to expand routable user-facing surface.
2. Introduce at least one LLM-assisted or closed-loop capability in monday workflows to raise AI-enabled ratio above 0.15.
3. Add verify-stage checks (preflight/validation/test guardrails) for monday operations before graduation request.
