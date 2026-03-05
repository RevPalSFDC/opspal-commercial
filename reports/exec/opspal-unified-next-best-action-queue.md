# OpsPal Unified Next-Best-Action Queue Pack

Source Fingerprint: `305808dbe315d5f1`

## Objective
Provide a unified cross-plugin remediation queue with wave planning, ownership rollups, and explicit governance dependencies.

## Ranked Queue

| Rank | Opportunity | Title | Category | Risk | Score | Owner | Wave |
|---:|---|---|---|---|---:|---|---|
| 1 | `OPP-003` | Copilot Approval Queue for Mandatory Route Outputs | `ai_leverage` | `critical` | 4.4 | `revpal-platform` | `wave_1` |
| 2 | `OPP-009` | Unified RevOps Next-Best-Action Layer | `ai_leverage` | `high` | 4.2 | `revpal-platform` | `wave_1` |
| 3 | `OPP-005` | Data Hygiene Sunset Completion | `feature_gap` | `high` | 4.18 | `revpal-platform` | `wave_1` |
| 4 | `OPP-001` | Capability Narrative Drift Guardrail | `feature_gap` | `medium` | 4.06 | `revpal-platform` | `wave_2` |
| 5 | `OPP-004` | Cross-Plugin Command Telemetry Contract | `feature_gap` | `high` | 3.88 | `revpal-platform` | `wave_2` |
| 6 | `OPP-007` | Manual Review Load Reduction in Dedup and Routing | `ai_leverage` | `high` | 3.88 | `revpal-platform` | `wave_2` |
| 7 | `OPP-002` | AI Maturity Uplift for Lowest-Coverage Plugins | `ai_leverage` | `medium` | 3.7 | `revpal-platform` | `wave_2` |
| 8 | `OPP-011` | Initiative ROI Instrumentation Layer | `feature_gap` | `medium` | 3.68 | `revpal-platform` | `wave_3` |
| 9 | `OPP-012` | Strategy Dashboard Gap Category Feeds | `feature_gap` | `medium` | 3.66 | `revpal-platform` | `wave_3` |
| 10 | `OPP-006` | Monday Plugin Graduation Readiness | `feature_gap` | `medium` | 3.18 | `revpal-experimental` | `wave_3` |
| 11 | `OPP-008` | Cross-Model Consultation Expansion | `ai_leverage` | `medium` | 3.18 | `revpal-ai` | `wave_3` |
| 12 | `OPP-010` | Forecast and Simulation Standardization | `feature_gap` | `medium` | 3.18 | `revpal-gtm` | `wave_3` |

## Owner Rollup

| Owner Team | Queue Items |
|---|---:|
| `revpal-platform` | 9 |
| `revpal-ai` | 1 |
| `revpal-experimental` | 1 |
| `revpal-gtm` | 1 |

## Risk Rollup
- Critical: 1
- High: 4
- Medium: 7
- Low: 0

## Dependency Map

| From | To | Rationale |
|---|---|---|
| `OPP-003` | `OPP-009` | Approval governance should be active before broad recommendation automation. |
| `OPP-004` | `OPP-009` | Telemetry contract should be in place for action outcome observability. |

## Current Queue Execution
- Approval queue present: `yes` (`state/copilot-approval-queue.json`)
- Approved work-item export present: `yes` (`reports/exec/runtime/opspal-approved-work-items.json`)
- Approval-required items execution-ready: 5/5
- Focal opportunity `OPP-009` execution-ready: `yes` (approval: `approved`, work item: `wi-apr-1771176220727-50bc66`, checklist: `yes`)
- Dependency gates ready: 2/2

| Opportunity | Approval Status | Ready Work Item | Runtime Checklist | Execution Ready |
|---|---|---|---|---|
| `OPP-003` | `approved` | `wi-apr-1771122550654-9e9d45` | `yes` | `yes` |
| `OPP-009` | `approved` | `wi-apr-1771176220727-50bc66` | `yes` | `yes` |
| `OPP-005` | `approved` | `wi-apr-1771176698166-b40b32` | `yes` | `yes` |
| `OPP-004` | `approved` | `wi-apr-1771177002482-8c63aa` | `yes` | `yes` |
| `OPP-007` | `approved` | `wi-apr-1771177808006-ce2a52` | `yes` | `yes` |

## Decision SLA Targets

| Risk Class | Decide Within (Hours) |
|---|---:|
| `critical` | 24 |
| `high` | 48 |
| `medium` | 120 |
| `low` | 168 |
