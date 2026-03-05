---
name: strategic-reporting-framework
description: |
  Provides standardized guidance for strategic GTM report generation.
  Use when generating reports from the strategic template library,
  applying metric definitions, or creating executive-ready outputs.

  TRIGGER KEYWORDS: "strategic report", "gtm report", "executive report",
  "metric definition", "data contract", "dashboard blueprint"
---

# Strategic Reporting Framework

This skill provides standardized guidance for generating strategic GTM reports that meet executive expectations for accuracy, clarity, and actionability.

## Report Quality Standards

### Data Accuracy Requirements
1. **Source Verification** - All data must trace to authoritative systems (Salesforce, HubSpot, billing)
2. **Calculation Validation** - Metrics must use canonical formulas from template definitions
3. **Reconciliation Checks** - Cross-reference totals (e.g., ARR waterfall must balance)
4. **Timestamp Consistency** - Use consistent period boundaries across all metrics

### Presentation Standards
1. **Executive Summary First** - Lead with key takeaways, not methodology
2. **Benchmark Context** - Always show metrics relative to industry benchmarks
3. **Trend Visualization** - Include historical context (minimum 4 quarters)
4. **Actionable Insights** - Every report must include recommended next steps

### Metric Definition Hierarchy
1. **Template Definition** - Use the metric definition from the template JSON
2. **Known Variants** - Apply variants only when explicitly appropriate
3. **Custom Calculations** - Document any deviations from standard formulas
4. **Pitfall Awareness** - Review pitfalls section before interpreting results

## Report Generation Workflow

### Phase 1: Template Selection
```
User Request → Keyword Matching → Template ID → Load Template JSON
```

Routing rules:
- Revenue/ARR/forecast → `gtm-revenue-modeler`
- Retention/churn/NRR → `gtm-retention-analyst`
- Market/TAM/ICP → `gtm-market-intelligence`
- Capacity/quota/ramp → `gtm-quota-capacity`

### Phase 2: Data Contract Validation
Before data collection:
1. Load `required_data_contract` from template
2. Verify required fields exist in target system
3. Check required timestamps are available
4. Validate join relationships

If validation fails, report missing fields and suggest alternatives.

### Phase 3: Data Collection
Query sequence:
1. Primary entity (Account, Opportunity)
2. Related entities via joins
3. Apply transformation rules
4. Run data quality checks

### Phase 4: Metric Calculation
For each metric in `metric_definitions`:
1. Apply canonical formula
2. Compute at correct grain
3. Include required dimensions
4. Calculate any derived fields

### Phase 5: Benchmark Application
1. Load `config/benchmark-baseline.json`
2. Match metrics to benchmark categories
3. Calculate variance from benchmarks
4. Classify performance (above/at/below)

### Phase 6: Insight Generation
Use `insight_prompts_for_agent`:
1. Generate narrative insights
2. Answer diagnostic questions
3. Identify recommended actions
4. Flag trigger conditions met

### Phase 7: Output Formatting
Apply `dashboard_blueprint`:
1. Create visualizations per panel specs
2. Apply visual types (bar, line, pie, etc.)
3. Include annotations and thresholds
4. Format for intended audience

## Metric Definitions Reference

### Revenue Metrics
| Metric | Formula | Grain |
|--------|---------|-------|
| ARR | Sum of annualized recurring revenue | Account |
| NRR | (Start + Expansion - Churn) / Start × 100 | Quarter |
| GRR | (Start - Churn) / Start × 100 | Quarter |

### Growth Metrics
| Metric | Formula | Grain |
|--------|---------|-------|
| New ARR | Sum of first-time customer ARR | Quarter |
| Expansion ARR | Sum of upsell/cross-sell ARR | Quarter |
| Churned ARR | Sum of lost recurring revenue | Quarter |

### Efficiency Metrics
| Metric | Formula | Grain |
|--------|---------|-------|
| LTV:CAC | Customer LTV / CAC | Account |
| CAC Payback | CAC / (ARR × Gross Margin) × 12 | Months |
| Magic Number | Net New ARR / Prior S&M Spend | Quarter |

## Data Quality Checks

### Required Checks (All Reports)
1. **Field Completeness** - No required fields are null
2. **Value Ranges** - Metrics within expected bounds
3. **Reconciliation** - Totals balance across views

### Report-Specific Checks
- **ARR Waterfall**: Starting + Changes = Ending
- **NRR/GRR**: GRR ≤ NRR ≤ 200%
- **Revenue Mix**: New + Expansion + Renewal = Total

## Related Skills
- `revenue-modeling-patterns` - Scenario and projection methods
- `market-sizing-methodology` - TAM/SAM/SOM calculations
