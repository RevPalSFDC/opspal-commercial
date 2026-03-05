# OpsPal Manual Review Reduction Pack

Source Fingerprint: `305808dbe315d5f1`

## Objective
Reduce manual-review burden in dedup and routing workflows with confidence-based triage and protected fallback paths.

## Focus Plugin Rollup

| Plugin | Hotspot Count |
|---|---:|
| `opspal-core` | 1 |
| `opspal-hubspot` | 0 |
| `opspal-salesforce` | 15 |

## Manual Review Hotspots

| Rank | Plugin | Asset Type | Asset | Hotspot Score | Matched Keywords | Source Path |
|---:|---|---|---|---:|---|---|
| 1 | `opspal-salesforce` | `agent` | sfdc-upsert-error-handler | 4 | `manual review, escalat` | `plugins/opspal-salesforce/agents/sfdc-upsert-error-handler.md` |
| 2 | `opspal-core` | `agent` | revops-churn-risk-scorer | 2 | `escalat` | `plugins/opspal-core/agents/revops-churn-risk-scorer.md` |
| 3 | `opspal-salesforce` | `agent` | sfdc-agent-governance | 2 | `approval` | `plugins/opspal-salesforce/agents/sfdc-agent-governance.md` |
| 4 | `opspal-salesforce` | `agent` | sfdc-automation-auditor | 2 | `approval` | `plugins/opspal-salesforce/agents/sfdc-automation-auditor.md` |
| 5 | `opspal-salesforce` | `agent` | sfdc-automation-builder | 2 | `approval` | `plugins/opspal-salesforce/agents/sfdc-automation-builder.md` |
| 6 | `opspal-salesforce` | `agent` | sfdc-planner | 2 | `approval` | `plugins/opspal-salesforce/agents/sfdc-planner.md` |
| 7 | `opspal-salesforce` | `command` | validate-approval-framework | 2 | `approval` | `plugins/opspal-salesforce/commands/validate-approval-framework.md` |
| 8 | `opspal-salesforce` | `script` | approval-assignment-extractor | 1 | `approval` | `plugins/opspal-salesforce/scripts/lib/approval-assignment-extractor.js` |
| 9 | `opspal-salesforce` | `script` | approval-bypass | 1 | `approval` | `plugins/opspal-salesforce/scripts/approval-bypass.sh` |
| 10 | `opspal-salesforce` | `script` | approval-flow-generator | 1 | `approval` | `plugins/opspal-salesforce/scripts/lib/approval-flow-generator.js` |
| 11 | `opspal-salesforce` | `script` | approval-framework-validator | 1 | `approval` | `plugins/opspal-salesforce/scripts/lib/approval-framework-validator.js` |
| 12 | `opspal-salesforce` | `script` | approval-process-analyzer | 1 | `approval` | `plugins/opspal-salesforce/scripts/automation/approval-process-analyzer.js` |
| 13 | `opspal-salesforce` | `script` | approval-queue-monitor | 1 | `approval` | `plugins/opspal-salesforce/scripts/lib/approval-queue-monitor.js` |
| 14 | `opspal-salesforce` | `skill` | automation-building-patterns | 1 | `approval` | `plugins/opspal-salesforce/skills/automation-building-patterns/SKILL.md` |
| 15 | `opspal-salesforce` | `script` | flow-permission-escalator | 1 | `escalat` | `plugins/opspal-salesforce/scripts/lib/flow-permission-escalator.js` |
| 16 | `opspal-salesforce` | `script` | quote-approval-health | 1 | `approval` | `plugins/opspal-salesforce/scripts/quote-approval-health.sh` |

## Review Load Targets
- Baseline index: 16
- 90-day target index: 10
- Target reduction ratio: 0.38

## Confidence Triage Policy
- Auto-route threshold: 0.85
- Assisted-route threshold: 0.65
- Manual-review threshold: 0.64
- Rule: Scores below assisted threshold remain in manual review.

## Execution Snapshot
- Triage telemetry file: `state/next-action-triage-telemetry.ndjson`
- Triage events detected: 17
- Latest triage event: `2026-02-15T23:50:14.142Z`
- Shadow mode enabled: `yes`
- Distribution consistent: `yes`
- Distribution: total=12, auto=4, assisted=5, manual=3
- Approved work items detected: 1
- Ready work item: `wi-apr-1771177808006-ce2a52` (state: `ready`)
- Execution checklist detected: `yes`
- Shadow-triage checklist detected: `yes`
- Shadow-triage checklist path: `reports/exec/runtime/wi-apr-1771177808006-ce2a52-phase3-shadow-triage-checklist.md`
- Triage shadow-mode ready: `yes`
- Runtime handoff ready: `yes`
- Ready for phase-2 execution: `yes`

## Recommended Next Steps
1. Instrument confidence scoring on highest-volume dedup/routing flows first.
2. Route medium-confidence cases to assisted review queue with suggested remediation.
3. Keep low-confidence and high-risk cases in mandatory manual review path.
