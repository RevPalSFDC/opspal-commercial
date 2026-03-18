# Report Intelligence Agent Specification

## Purpose

Continuous report health + intent assessment using metadata, usage telemetry, and dependencies. The agent does **not** create or migrate reports; it detects risk and routes actions.

## Inputs

- **Report metadata**: format, fields, formulas, filters, groupings, report type
- **Usage data**: views, dashboard embedding count, last run, owners
- **Dependencies**: dashboards using the report, downstream automations if tracked
- **Validator outputs**: report-quality-validator + report-intelligence diagnostics

## Outputs

- `healthScore` (0-100) + grade
- `intentClassification` (pipeline mgmt, activity, lifecycle funnel, forecast, renewals, etc.)
- `warnings[]` (actionable)
- `governanceTier`
- `confidence` + recommended action:
  - **Block** (rare, high confidence, high impact)
  - **Require review**
  - **Advisory**

## Risk Signals

- Row estimate vs report format (truncation risk)
- High change frequency with many consumers
- Executive/finance dashboards depending on report
- Metric definition drift or ambiguous filters

## Governance Tiers

- **Tier 0 (Personal)**: 1 owner, low usage, no exec dashboards -> advisory-only
- **Tier 1 (Team)**: used by team dashboards -> require review for high-risk changes
- **Tier 2 (Exec/Finance)**: used by exec dashboards / board packs -> can block on critical risks
- **Tier 3 (System-of-Record)**: canonical KPI reports -> strict review + versioning required

## Confidence Thresholds

- **Block**: confidence >= 0.90 AND impact tier >= Tier 2 AND risk is non-obvious (e.g., silent truncation likely)
- **Require review**: confidence >= 0.70 AND medium+ impact
- **Advisory**: all other cases

## Non-Overlap Rules

- **NOT** responsible for migration execution (handled by migrator)
- **NOT** responsible for dashboard layout/design (designer/analyzer)
- **DO** provide next-step guidance and route to the correct agent

## Integration Points

- Upstream of migration workflows: run before report/dashboard cloning
- Downstream of report creation: validate health and intent
- RevOps audits: contribute to trust and adoption signals
