---
name: gtm-plan
description: Start orchestrated GTM annual planning workflow with data quality, territories, quotas, and compensation
argument-hint: "[--fiscal-year FY2026] [--stage kickoff|territories|quotas|comp|review]"
visibility: user-invocable
aliases:
  - gtm-kickoff
  - annual-plan
tags:
  - gtm
  - planning
  - orchestration
---

# /gtm-plan Command

Start the comprehensive Go-To-Market annual planning workflow. This orchestrates all GTM planning stages with human approval gates.

## Usage

```bash
# Start full GTM planning for next fiscal year
/gtm-plan --fiscal-year FY2026

# Resume from a specific stage
/gtm-plan --stage territories

# Quick kickoff (data quality + strategy only)
/gtm-plan --quick
```

## Planning Stages

```
1. Data Quality Assessment
   └── Validates historical data sufficiency (2+ years)

2. Market Strategy Analysis
   └── TAM/SAM/SOM, competitive positioning

3. Territory Design
   └── Boundaries, fairness validation (Gini ≤0.3)

4. Quota Modeling
   └── P10/P50/P90 scenarios, attainability scoring

5. Compensation Planning
   └── Base/variable split, accelerators, UAT

6. Final Review & Approval
   └── Executive summary, implementation plan
```

## Output Artifacts

| Stage | Output |
|-------|--------|
| Data Quality | `gtm-data-quality-report.json` |
| Strategy | `gtm-strategy-summary.md` |
| Territories | `territory-design.json` |
| Quotas | `quota-model.json` |
| Compensation | `comp-plan.json` |
| Final | `gtm-plan-{year}.pdf` |

## Routing

This command invokes the `gtm-planning-orchestrator` agent which coordinates all specialized agents:
- `gtm-data-insights` for data quality
- `gtm-strategy-planner` for market analysis
- `gtm-territory-designer` for boundaries
- `gtm-quota-capacity` for quota modeling
- `gtm-comp-planner` for compensation

## Requirements

- Salesforce org with 2+ years of Opportunity data
- Account hierarchy defined
- (Optional) HubSpot engagement data for territory scoring
