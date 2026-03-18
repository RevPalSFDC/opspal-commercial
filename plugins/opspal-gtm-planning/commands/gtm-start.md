---
name: gtm-start
description: GTM Planning onramp — check prerequisites, show phase overview, and guide entry into the 7-phase GTM planning methodology
argument-hint: "[optional: fiscal-year e.g. FY2027]"
intent: Guide user through GTM planning prerequisites and phase selection before starting the planning methodology
dependencies: [gtm-planning-orchestrator]
failure_modes: [org_slug_missing, salesforce_not_connected, insufficient_historical_data]
---

# GTM Planning Start

This is the entry point for GTM annual planning. It checks prerequisites, explains the 7-phase methodology, and helps you enter at the right phase.

## Instructions

### Step 1: Prerequisites Check

Before starting, verify:

1. **ORG_SLUG is set** — Check `${ORG_SLUG}` environment variable
   - If not set, ask the user to run: `export ORG_SLUG=<client-name>`

2. **Salesforce org connected** — Check for SF_TARGET_ORG or attempt `sf org list`
   - Required for pipeline data, territory modeling, and quota analysis

3. **Historical data available** — At least 2 years of Opportunity data recommended
   - Check: `sf data query --query "SELECT MIN(CloseDate) FROM Opportunity WHERE IsWon=true" --target-org ${SF_TARGET_ORG}`

4. **HubSpot connection** (recommended but optional) — Check HUBSPOT_PORTAL_ID
   - Enriches territory scoring with engagement data

5. **Working directory** — Verify `orgs/${ORG_SLUG}/platforms/gtm-planning/` exists or create it

### Step 2: Phase Overview

Display the 7-phase GTM planning methodology:

```
GTM Annual Planning — 7-Phase Methodology
==========================================

Phase 1: DATA QUALITY ASSESSMENT (Week 1)
  └─ Agent: gtm-data-insights
  └─ Output: gtm-data-quality-report.json
  └─ Gate: Data quality score >= 70%

Phase 2: MARKET ANALYSIS & STRATEGY (Weeks 1-2)
  └─ Agent: gtm-strategy-planner
  └─ Output: gtm-strategy-summary.md
  └─ Gate: Stakeholder review

Phase 3: TERRITORY DESIGN (Weeks 2-4)
  └─ Agent: gtm-territory-designer
  └─ Output: territory-design.json, territory-map.csv
  └─ Gate: Fairness validation (Gini <= 0.3)

Phase 4: QUOTA MODELING (Weeks 3-5)
  └─ Agent: gtm-quota-capacity
  └─ Output: quota-model.json (P10/P50/P90 scenarios)
  └─ Gate: >50% historical attainability

Phase 5: COMPENSATION PLANNING (Weeks 4-6)
  └─ Agent: gtm-comp-planner
  └─ Output: comp-plan.json, uat-results.csv
  └─ Gate: UAT pass + compliance check

Phase 6: ATTRIBUTION GOVERNANCE (Weeks 5-7)
  └─ Agent: gtm-attribution-governance
  └─ Output: attribution-rules.json
  └─ Gate: Stakeholder sign-off

Phase 7: FINAL REVIEW & ACTIVATION (Weeks 7-12)
  └─ Agent: gtm-planning-orchestrator
  └─ Output: gtm-plan-{fy}.pdf
  └─ Gate: Executive approval
```

### Step 3: Entry Point Selection

Ask the user where they want to start:

- **Fresh start** → Begin at Phase 1 with `/gtm-data-quality`
- **Resume existing cycle** → Check for `cycle-state.json` in the GTM directory and resume at the current phase
- **Specific phase** → Jump to any phase with the corresponding command:
  - Phase 1: `/gtm-data-quality`
  - Phase 2: `/gtm-strategy`
  - Phase 3: `/gtm-territory`
  - Phase 4: `/gtm-quota`
  - Phase 5: `/gtm-comp`
  - Phase 6: `/gtm-report` (attribution)
  - Phase 7: `/gtm-plan` (full orchestration)

### Step 4: Initialize Cycle State

If starting fresh, create the cycle state file:

```json
{
  "cycle": "FY2027",
  "org": "${ORG_SLUG}",
  "status": "active",
  "current_phase": 1,
  "started_at": "2026-03-16T00:00:00Z",
  "phases": {
    "1": { "status": "not_started" },
    "2": { "status": "not_started" },
    "3": { "status": "not_started" },
    "4": { "status": "not_started" },
    "5": { "status": "not_started" },
    "6": { "status": "not_started" },
    "7": { "status": "not_started" }
  }
}
```

Save to: `orgs/${ORG_SLUG}/platforms/gtm-planning/${fiscal_year}/cycle-state.json`

### Important Notes

- **Each phase has a gate** — phases should be completed in order
- **Phase gates require human approval** — do not auto-advance
- **All artifacts are saved** in the org's GTM planning directory
- **The planning orchestrator** (`/gtm-plan`) handles full end-to-end coordination
- **Strategic reports** can be generated at any time with `/gtm-report <template-id>`
