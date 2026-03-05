# OpsPal 90-Day Initiatives

Source Fingerprint: `305808dbe315d5f1`

## Portfolio Summary
- Plugins in scope: 8
- Total command surface: 234
- Copilot-first posture: production-impacting actions remain human-approved.
- Selected initiatives: top 5 by weighted score from `opspal-gap-priority-matrix.csv`.

## Progress Snapshot
- Approved work items promoted: 6 (ready: 6)
- Funded initiatives with approved work items: 3/5
- Telemetry pilot coverage (OPP-004): 15/15 (ratio 1)
- Control-plane telemetry coverage: 5/5
- Runtime phase checklists detected: 22

| Opportunity | Initiative | Status | Evidence |
|---|---|---|---|
| `OPP-001` | Capability Narrative Drift Guardrail | `complete` | Documentation drift rows currently 0. |
| `OPP-003` | Copilot Approval Queue for Mandatory Route Outputs | `complete` | Approval queue execution checklist captured and promoted work item is ready. |
| `OPP-009` | Unified RevOps Next-Best-Action Layer | `complete` | Queue execution snapshot: OPP-009 approval=approved, ready_work_item=wi-apr-1771176220727-50bc66, checklist=yes, execution_ready=yes; dependency_gates_ready=2/2. |
| `OPP-002` | AI Maturity Uplift for Lowest-Coverage Plugins | `complete` | AI maturity execution snapshot: tracked_evidence=3/3, positive_uplift_gap=3/3, handoff_proof=yes, completion_gate=ready. |
| `OPP-004` | Cross-Plugin Command Telemetry Contract | `complete` | Pilot telemetry coverage 15/15 (1); phase checklists: phase2=yes, phase3-control=yes, phase3-pilot=yes. |

## Funded Initiatives
### A. Initiative A - Documentation Trust Layer
- Linked Opportunity: `OPP-001` (Capability Narrative Drift Guardrail)
- Objective: Eliminate product capability drift between narrative docs and generated registry outputs.
- KPI: Drift rows reduced from current baseline to 0 (baseline currently captured in opportunity matrix).
- Deliverables:
- Automated drift check comparing README/FEATURES claims to generated catalog totals
- Release-blocking policy for unresolved metric drift
- Executive digest output with approved source-of-truth pointers

### B. Initiative B - Copilot Approval Queue
- Linked Opportunity: `OPP-003` (Copilot Approval Queue for Mandatory Route Outputs)
- Objective: Standardize human approval routing for production-impacting recommendations from mandatory agents.
- KPI: 100% of high-risk recommendations routed through explicit approval checkpoints.
- Deliverables:
- Shared approval object with risk class + confidence + rollback metadata
- Approval queue by severity with explicit approver roles
- Audit-friendly decision log for accepted/rejected AI recommendations

### C. Initiative C - Unified Next-Best-Action Layer
- Linked Opportunity: `OPP-009` (Unified RevOps Next-Best-Action Layer)
- Objective: Consolidate diagnostic outputs into ranked remediation actions with clear ownership and expected value.
- KPI: Reduce average time from diagnosis to approved action by 30% in pilot teams.
- Deliverables:
- Normalized recommendation contract across Salesforce/HubSpot/Marketo/Core
- Cross-plugin prioritization service producing top remediation queue
- Action-level KPI projections (risk avoided, time saved, revenue lift)

### D. Initiative D - AI Maturity Uplift Pack
- Linked Opportunity: `OPP-002` (AI Maturity Uplift for Lowest-Coverage Plugins)
- Objective: Raise AI-enabled coverage in lowest-maturity active plugins using reusable copilot patterns.
- KPI: Lift AI-enabled ratio by at least 15 percentage points in targeted plugins.
- Deliverables:
- Reusable LLM-assisted analysis blocks for selected low-ratio plugins
- Confidence-scored recommendation templates with deterministic fallback
- Plugin-level maturity scorecards refreshed each release

### E. Initiative E - Command Telemetry Contract Adoption
- Linked Opportunity: `OPP-004` (Cross-Plugin Command Telemetry Contract)
- Objective: Implement a standard command telemetry envelope for suite-level executive reporting.
- KPI: Capture telemetry for at least 80% of high-volume commands in pilot scope.
- Deliverables:
- Published telemetry schema with validation checks
- Command emitters in pilot commands for outcome + override + rework tracking
- Executive rollup dashboard feed in JSON for strategy consumers

## Dependency Notes
- Initiative A should land first to stabilize reporting trust.
- Initiative B and Initiative C can run in parallel once telemetry definitions are agreed.
- Initiative D should reuse Initiative C recommendation contracts.
- Initiative E must publish schema validation before broad adoption.
