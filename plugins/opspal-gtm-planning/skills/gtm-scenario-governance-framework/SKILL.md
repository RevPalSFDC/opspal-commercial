---
name: gtm-scenario-governance-framework
description: Govern GTM scenario planning with assumption tracking, sensitivity analysis, and decision records.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-gtm-planning:gtm-planning-orchestrator
version: 1.0.0
---

# GTM Scenario Governance Framework

## When to Use This Skill

Use this skill when:
- Building multi-scenario GTM plans (base/upside/downside) that need version control
- Tracking assumptions that underpin quota, territory, or capacity models
- Running sensitivity analysis to identify which assumptions drive the most variance
- Creating decision records for scenario selection and approval gates
- Annual/quarterly planning cycles require governed scenario comparison

**Not for**: Revenue modeling calculations (use `gtm-revenue-modeling`), territory design (use `/gtm-territory`), or quota capacity modeling (use `quota-capacity-modeling`).

## Scenario Framework

| Scenario | Growth Assumption | Use Case |
|----------|-------------------|----------|
| **Conservative (P10)** | -20% from base | Board minimum, risk planning |
| **Base (P50)** | Historical trend + market data | Default plan, quota setting |
| **Aggressive (P90)** | +30% from base | Stretch targets, hiring ahead |

## Governance Requirements

| Control | Description |
|---------|-------------|
| **Assumption versioning** | Every assumption has an owner, source, and version date |
| **Sensitivity tagging** | Each assumption tagged with impact: High/Medium/Low |
| **Approval trail** | Scenario selection decision recorded with approver and rationale |
| **Extrapolation flag** | Assumptions beyond 2x historical range require explicit justification |

## Workflow

### Step 1: Define Scenario Scope
- Planning horizon (quarterly, annual, 3-year)
- Core assumptions to vary (growth rate, win rate, deal size, rep ramp)
- Fixed constraints (headcount cap, budget ceiling, market size)

### Step 2: Build Scenario Registry
For each scenario, document:
- Name, description, probability weight
- All assumptions with source data and confidence level
- Sensitivity rank (which assumptions matter most)

### Step 3: Run Sensitivity Analysis
Vary each assumption +/-20% independently to identify which drive the largest revenue variance. Focus governance attention on high-sensitivity assumptions.

### Step 4: Produce Decision Artifacts
- Scenario comparison table (side-by-side revenue, headcount, cost)
- Recommendation with rationale
- Decision memo with approver sign-off
- Implementation plan for selected scenario

## Safety Checks

- Version all assumptions explicitly (no implicit "same as last year")
- Capture approval trail for scenario selection
- Flag assumptions that extrapolate beyond 2x historical range
- Re-validate scenarios quarterly as actuals come in

## Output Artifacts

- `scenario-registry.json` — All scenarios with assumptions
- `sensitivity-analysis.md` — Impact ranking of each assumption
- `decision-memo.md` — Selected scenario with rationale and approvals
