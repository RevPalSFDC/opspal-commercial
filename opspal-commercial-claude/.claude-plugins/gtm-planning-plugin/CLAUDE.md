# GTM Planning Plugin - User Guide

This file provides guidance when using the GTM Planning Plugin with Claude Code.

## Plugin Overview

The **GTM Planning Plugin** provides a comprehensive framework for Go-To-Market annual planning, including territory design, quota modeling, compensation planning, and attribution governance.

**Version**: 1.5.1
**Status**: Hidden from marketplace listing (specialized use case)
**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## Quick Start

### Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-internal-plugins
/plugin install gtm-planning-plugin@revpal-internal-plugins
```

### Verify Installation

```bash
/agents | grep gtm
```

## Key Features

### Territory Design
- Boundary definition by geography, industry, or named accounts
- Fairness validation (Gini coefficient ≤0.3)
- Workload balancing across reps
- Overlap resolution

### Quota Modeling
- Scenario modeling (P10/P50/P90)
- Historical performance analysis
- Growth target distribution
- Attainability scoring

### Compensation Planning
- Base/variable split optimization
- Accelerator design
- UAT validation
- Compliance checking

### Attribution Governance
- Data dictionary maintenance
- Attribution rule definition
- Source prioritization
- Conflict resolution

## Available Agents

| Agent | Description | Trigger Keywords |
|-------|-------------|------------------|
| `gtm-planning-orchestrator` | Master coordinator | "GTM planning", "annual plan" |
| `gtm-strategy-planner` | Market analysis | "GTM strategy", "market analysis" |
| `gtm-territory-designer` | Territory boundaries | "design territories", "territory plan" |
| `gtm-quota-capacity` | Quota modeling | "quota model", "capacity plan" |
| `gtm-comp-planner` | Compensation design | "compensation plan", "comp design" |
| `gtm-data-insights` | Data quality | "data quality", "GTM data" |
| `gtm-attribution-governance` | Attribution rules | "attribution", "data governance" |

## Common Workflows

### Annual Planning Kickoff

```bash
# Start orchestrated planning
"Begin GTM planning for FY2026"

# This triggers:
# 1. Data quality assessment
# 2. Market analysis
# 3. Territory design
# 4. Quota modeling
# 5. Compensation planning
# 6. Final review and approval
```

### Territory Design

```bash
# Design territories for a region
"Design territories for 15 reps covering EMEA"

# Include fairness validation
"Validate territory fairness and adjust for workload balance"

# Handle named accounts
"Carve out named accounts for enterprise team"
```

### Quota Modeling

```bash
# Create quota scenarios
"Create quota scenarios for Q1 with 20% growth target"

# Model P10/P50/P90
"Show quota attainability at P10, P50, and P90 confidence levels"

# Distribute targets
"Distribute $10M quota across 8 reps based on territory potential"
```

### Compensation Planning

```bash
# Design compensation
"Design AE compensation with 50/50 base/variable split"

# Add accelerators
"Add 2x accelerator above 100% quota attainment"

# Run UAT
"Validate compensation scenarios with test data"
```

## Planning Workflow Stages

```
Plan → Validate → Model → Propose → Implement
  ↓        ↓        ↓        ↓          ↓
Data   Strategy  Territory  Comp    Production
Quality          Quota     Review   Deployment
```

**Each stage requires human approval before proceeding.**

## Best Practices

### Data Requirements
- Minimum 2 years historical data for quota modeling
- Clean Account/Opportunity data in Salesforce
- Optional: HubSpot engagement data for territory scoring

### Fairness Validation
- Gini coefficient ≤0.3 for territory balance
- ≤20% variance in territory potential
- Document any intentional imbalances

### Approval Gates
- Each stage produces deliverables for review
- Stakeholder sign-off required before proceeding
- Changes trigger re-validation of downstream stages

### Documentation
- Maintain data dictionary for all GTM metrics
- Document assumptions in territory design
- Keep compensation plan UAT results

## Troubleshooting

### "Insufficient historical data"

**Cause**: Less than 2 years of Opportunity data
**Fix**: Use industry benchmarks or adjust confidence intervals

### "Territory fairness check failed"

**Cause**: Gini coefficient >0.3
**Fix**: Rebalance territories or document justification

### "Quota attainability below threshold"

**Cause**: Historical attainment <50%
**Fix**: Adjust quota targets or territory assignments

## Output Artifacts

| Stage | Output |
|-------|--------|
| Data Quality | `gtm-data-quality-report.json` |
| Strategy | `gtm-strategy-summary.md` |
| Territories | `territory-design.json`, `territory-map.csv` |
| Quotas | `quota-model.json`, `scenarios.csv` |
| Compensation | `comp-plan.json`, `uat-results.csv` |
| Final | `gtm-plan-fy{year}.pdf` |

## Documentation

- **README.md** - Plugin overview
- **USAGE.md** - Detailed usage examples
- **CHANGELOG.md** - Version history

## Support

- GitHub Issues: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- Reflection System: Use `/reflect` to submit feedback

---

**Version**: 1.5.1
**Last Updated**: 2025-11-25
