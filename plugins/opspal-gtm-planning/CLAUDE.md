# GTM Planning Plugin - User Guide

This file provides guidance when using the GTM Planning Plugin with Claude Code.

## Plugin Overview

The **GTM Planning Plugin** provides a comprehensive framework for Go-To-Market annual planning, including territory design, quota modeling, compensation planning, attribution governance, and **strategic reporting templates**.

**Version**: 2.0.0
**Status**: Hidden from marketplace listing (specialized use case)
**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## New in v2.0: Strategic Reporting Templates

### 13 Strategic Report Templates

| Template ID | Report Name | Agent |
|-------------|-------------|-------|
| `multi-year-revenue-model` | Multi-Year Revenue Model (3-5 yr) | gtm-revenue-modeler |
| `scenario-planning-model` | Upside/Base/Downside Scenarios | gtm-revenue-modeler |
| `arr-waterfall` | ARR Waterfall | gtm-revenue-modeler |
| `net-dollar-retention` | Net Dollar Retention (NRR/GRR) | gtm-retention-analyst |
| `bookings-to-revenue-conversion` | Bookings & Revenue Conversion | gtm-retention-analyst |
| `revenue-mix-new-expansion-renewal` | Revenue Mix Analysis | gtm-retention-analyst |
| `revenue-by-segment` | Revenue by Segment/Industry/Geo | gtm-market-intelligence |
| `tam-sam-som` | TAM/SAM/SOM by Segment | gtm-market-intelligence |
| `icp-performance-win-profile` | ICP Performance & Win Profile | gtm-market-intelligence |
| `product-adoption-by-segment` | Product Adoption & Expansion | gtm-market-intelligence |
| `new-hire-ramp-model` | New Hire Ramp Model | gtm-quota-capacity |
| `sales-capacity-model` | Sales Capacity Model | gtm-quota-capacity |
| `customer-support-capacity-model` | CS/Support Capacity Model | gtm-quota-capacity |

### Quick Report Commands

```bash
# Generate any strategic report
/gtm-report <template-id> [options]

# Revenue modeling
/gtm-revenue-model --years 5 --base-growth 30
/gtm-scenario --base-arr 10000000
/gtm-arr-waterfall --period Q4-2025

# Retention analysis
/gtm-retention --cohorts true --segments enterprise,mid-market
/gtm-revenue-mix --trend --compare-benchmark

# Market intelligence
/gtm-market-size --method bottom-up --segments true
/gtm-icp-analysis --attributes industry,size,use-case
```

### Cross-Plugin Integration

Other plugins can call GTM reports:
```javascript
Task({
  subagent_type: 'gtm-strategic-reports-orchestrator',
  prompt: `Generate report: arr-waterfall
    Period: Q4-2025
    Data Source: salesforce
    Output Format: pdf`
});
```

## Quick Start

### Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-internal-plugins
/plugin install opspal-gtm-planning@revpal-internal-plugins
```

### Verify Installation

```bash
/agents | grep gtm
```

## Key Features

### Validation Framework (NEW)

**Comprehensive validation system preventing errors in GTM planning operations**

The Validation Framework provides automatic error prevention through 5 validation stages:

1. **Schema Validation** - Validates planning data structure against JSON schemas
2. **Parse Error Handling** - Auto-fixes JSON/CSV parsing issues in territory/quota data
3. **Data Quality** - Detects synthetic/test data in planning models (4-layer scoring)
4. **Tool Contract** - Validates planning tool invocations before execution
5. **Permission Validation** - Checks bulk operations on planning data

**Automatic Hooks** (already enabled):
- `pre-reflection-submit.sh` - Validates reflections before submission
- `pre-tool-execution.sh` - Validates planning tool calls

**Quick Commands**:
```bash
# Generate validation dashboard
node ../opspal-core/scripts/lib/validation-dashboard-generator.js generate --days 30

# Test data quality validation (for territory/quota data)
node ../salesforce-plugin/scripts/lib/enhanced-data-quality-framework.js validate \
  --query-result ./territory-data.json

# Temporarily disable validation
export SKIP_VALIDATION=1              # All validation
export SKIP_TOOL_VALIDATION=1         # Tool validation only
```

**Documentation**: See `../../docs/VALIDATION_FRAMEWORK_GUIDE.md` for complete guide

**Performance**:
- <500ms total validation time
- <100ms data quality check for planning models
- 95%+ pass rate for legitimate operations

**Common Validations**:
- ✅ Territory fairness validation (Gini coefficient ≤0.3)
- ✅ Quota attainability checks (>50% historical attainment)
- ✅ Compensation plan UAT data validation
- ✅ Synthetic territory/quota data detection
- ✅ Historical data requirements (minimum 2 years)
- ✅ Stakeholder approval gate validation

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

### Strategic Reporting Agents (NEW)

| Agent | Description | Trigger Keywords |
|-------|-------------|------------------|
| `gtm-strategic-reports-orchestrator` | Master coordinator for strategic reports | "strategic report", "gtm report" |
| `gtm-revenue-modeler` | Multi-year projections, scenarios, waterfalls | "revenue model", "arr projection", "scenario" |
| `gtm-retention-analyst` | NRR/GRR, bookings conversion, revenue mix | "nrr", "retention", "churn", "expansion" |
| `gtm-market-intelligence` | TAM/SAM/SOM, segments, ICP analysis | "tam", "market size", "icp", "win profile" |
| `forecast-orchestrator` | Revenue forecasting, pipeline prediction, variance tracking | "forecast", "revenue prediction", "booking forecast" |

### Planning Agents

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

**Version**: 2.0.0
**Last Updated**: 2026-01-13
