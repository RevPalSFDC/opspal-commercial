---
name: score-actionability
description: Evaluate dashboard component actionability using 5-criteria weighted scoring to identify vanity metrics
argument-hint: "<dashboard-file-or-org>"
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - TodoWrite
thinking-mode: enabled
---

# Score Actionability

## Purpose

**What this command does**: Evaluates Salesforce dashboard components against actionability criteria to determine if metrics prompt action or are "vanity metrics" that look good but don't drive decisions.

**Actionability Criteria Evaluated**:
1. **Has Target** (30%) - Does the metric show a benchmark or goal?
2. **Has Trend** (25%) - Does it show direction over time?
3. **Has Drill-Down** (20%) - Can users investigate anomalies?
4. **Has Action Guidance** (15%) - Is there guidance on what to do?
5. **Has Owner** (10%) - Is someone accountable for this metric?

**When to use it**:
- ✅ Before deploying new dashboards
- ✅ During dashboard redesign projects
- ✅ When stakeholders ask "what should I do with this number?"
- ✅ Quarterly executive dashboard reviews
- ✅ To justify dashboard component removal

**When NOT to use it**:
- ❌ For report-level quality assessment (use `/audit-reports`)
- ❌ For technical validation (use dashboard-quality-validator)
- ❌ For usage/adoption metrics (use trust erosion check)

## Prerequisites

### Required Configuration

**Dashboard Metadata** (one of):
- Salesforce Dashboard JSON export
- Dashboard metadata from org query
- Local dashboard definition file

**For Org-Based Analysis**:
```bash
sf org login web --alias myorg
sf org display --target-org myorg
```

## Usage

### Basic Usage

```bash
/score-actionability <dashboard-file-or-org>
```

**Examples**:
```bash
# Score a local dashboard file
/score-actionability ./dashboards/Executive_Pipeline.json

# Score dashboards in an org
/score-actionability production --dashboard "Executive Pipeline Dashboard"

# Score all dashboards in a folder
/score-actionability production --folder "Executive Dashboards"
```

### Advanced Options

**Custom actionability thresholds**:
```bash
/score-actionability <target> --actionable-threshold 70 --vanity-threshold 40
```

**Focus on specific persona**:
```bash
/score-actionability <target> --persona cro
/score-actionability <target> --persona vp_sales
```

**Output format**:
```bash
/score-actionability <target> --format json --output actionability-report.json
/score-actionability <target> --format markdown --output ACTIONABILITY_REPORT.md
```

**Include improvement suggestions**:
```bash
/score-actionability <target> --suggest-improvements
```

## Execution Workflow

### Step 1: Dashboard Loading
- Parse dashboard metadata (JSON or org query)
- Extract component configurations
- Identify metric types and data sources
- **Time**: 5-30 seconds

### Step 2: Criteria Evaluation
For each component, evaluate:

**Has Target** (30%):
- Check for `target`, `benchmark`, `goal`, `greenZone`, `redZone`
- Gauge breakpoints present?
- Comparison to prior period?

**Has Trend** (25%):
- Check for `showTrend`, `trendLine`, `comparison`
- Is chart type Line or Area?
- Prior period comparison enabled?

**Has Drill-Down** (20%):
- Check for `clickthrough`, `drillDown`, `linkedReport`
- Component linked to detail report?
- Can users investigate anomalies?

**Has Action Guidance** (15%):
- Check for `tooltip`, `description`, `helpText`
- Conditional formatting with messages?
- What-to-do guidance present?

**Has Owner** (10%):
- Check for `owner`, `responsible`, `accountable`
- Metric ownership documented?
- Someone to contact for questions?

**Time**: 10-30 seconds

### Step 3: Score Calculation
- Sum weighted criteria scores per component
- Calculate dashboard average
- Classify components: Actionable / Partially Actionable / Vanity
- **Time**: 5-10 seconds

### Step 4: Report Generation
- Generate executive summary
- List vanity metrics with improvement recommendations
- Prioritize by impact (high-visibility components first)
- **Time**: 5-10 seconds

## Output Structure

```
instances/<org-alias>/actionability-<date>/
├── ACTIONABILITY_REPORT.md         # Executive summary
├── component-scores.json            # Individual component scores
├── actionable-components.csv        # Score ≥70
├── partial-components.csv           # Score 40-69
├── vanity-components.csv            # Score <40
├── improvement-suggestions.json     # How to improve each metric
└── persona-alignment.json           # Match to persona KPI contracts
```

## Actionability Tiers

### Score Interpretation

| Score | Tier | Meaning | Action |
|-------|------|---------|--------|
| 70-100 | Actionable | Metric drives decisions | Maintain, consider as template |
| 40-69 | Partially Actionable | Some context, gaps exist | Add missing elements |
| 0-39 | Vanity | Looks good, no action prompt | Redesign or remove |

### Component Classification Examples

**Actionable (Score: 85)**:
```json
{
  "title": "Quarterly Pipeline vs Target",
  "type": "gauge",
  "target": "$5M",
  "greenZone": ">90%",
  "redZone": "<70%",
  "drillDown": "Pipeline Detail Report",
  "tooltip": "If <70%, accelerate prospecting"
}
```

**Partially Actionable (Score: 55)**:
```json
{
  "title": "Win Rate Trend",
  "type": "line",
  "showTrend": true,
  "comparison": "Prior Quarter"
  // Missing: target, drill-down, action guidance, owner
}
```

**Vanity (Score: 20)**:
```json
{
  "title": "Total Deals",
  "type": "metric",
  "value": "142"
  // Missing: target, trend, drill-down, guidance, owner
  // Question: "142 deals - is that good or bad?"
}
```

## Persona-Specific Evaluation

When `--persona` is specified, scores are adjusted based on decision-KPI matrix:

### CRO Expectations
- Must have: Pipeline weighted, Bookings TCV, Forecast accuracy
- Should have: Action triggers for "pipeline < 3x quota"
- Vanity warning: Activity counts without conversion context

### VP Sales Expectations
- Must have: Quota attainment, Win rate, Pipeline
- Should have: Coaching triggers, performance thresholds
- Vanity warning: Email/call counts without outcomes

### Sales Manager Expectations
- Must have: Team pipeline, Tasks overdue, Deal velocity
- Should have: Action lists, next steps visibility
- Vanity warning: Summary metrics without drill-down

## Improvement Suggestions

When `--suggest-improvements` is enabled:

### Missing Target
```json
{
  "component": "Pipeline Total",
  "missing": "has_target",
  "suggestion": "Add quota-based target (e.g., '3x coverage required')",
  "example": "target: '$15M (3x quota)'"
}
```

### Missing Trend
```json
{
  "component": "Win Rate",
  "missing": "has_trend",
  "suggestion": "Add prior period comparison or trend line",
  "example": "comparison: 'Prior Quarter', showTrend: true"
}
```

### Missing Drill-Down
```json
{
  "component": "Revenue by Region",
  "missing": "has_drill_down",
  "suggestion": "Link to detail report for investigation",
  "example": "drillDown: 'Revenue Detail by Region Report'"
}
```

### Missing Action Guidance
```json
{
  "component": "Forecast Accuracy",
  "missing": "has_action_guidance",
  "suggestion": "Add tooltip explaining response to low/high values",
  "example": "tooltip: 'If <80%, review forecast methodology with managers'"
}
```

### Missing Owner
```json
{
  "component": "Customer Health Score",
  "missing": "has_owner",
  "suggestion": "Assign accountable owner for this metric",
  "example": "owner: 'VP Customer Success'"
}
```

## Common Findings

### Typical Dashboard Issues

**Executive Dashboards**:
- 40-60% vanity metrics (no targets, no action guidance)
- Missing drill-down links on summary charts
- No ownership assignment

**Manager Dashboards**:
- Missing trend context on performance metrics
- No action triggers for coaching moments
- Excessive detail without prioritization

**Rep Dashboards**:
- Activity metrics without outcome linkage
- No clear "what to do next" guidance
- Missing personal targets/quotas

## Integration with Other Commands

### Recommended Workflow

```bash
# 1. Score dashboard actionability
/score-actionability production --dashboard "Executive Pipeline"

# 2. Check for trust erosion (users creating workarounds)
/check-trust-erosion production

# 3. Analyze decay risk (will this dashboard be abandoned?)
/analyze-decay-risk production

# 4. Deep dive on usage
/audit-reports production
```

### Pre-Deployment Gate

```bash
# Block deployment if actionability score too low
/score-actionability ./new-dashboard.json --min-score 60 --fail-on-vanity
```

## Troubleshooting

### Error: "Cannot parse dashboard metadata"

**Cause**: Invalid JSON or unsupported format.

**Fix**: Ensure dashboard is exported as JSON with component details.

### Warning: "Low average actionability score (<50)"

**Cause**: Most components lack actionability elements.

**Action**:
1. Review vanity-components.csv
2. Apply improvement-suggestions.json
3. Consider removing low-value components

### Warning: "Persona alignment low (<60%)"

**Cause**: Dashboard doesn't include required KPIs for target persona.

**Action**:
1. Review persona-alignment.json
2. Add missing mandatory KPIs
3. Consider audience mismatch

## Success Metrics

**Expected Outcomes**:
- All dashboard components scored for actionability
- Vanity metrics identified with improvement paths
- Persona-specific alignment validated
- Clear remediation priorities

**ROI**:
- Reduce "what does this number mean?" questions
- Improve dashboard adoption rates
- Focus exec attention on actionable metrics
- Save redesign cycles by validating before deploy

## Configuration

### Customizing Criteria Weights

Edit `config/actionability-criteria.json`:
```json
{
  "has_target": { "weight": 30 },
  "has_trend": { "weight": 25 },
  "has_drill_down": { "weight": 20 },
  "has_action_guidance": { "weight": 15 },
  "has_owner": { "weight": 10 }
}
```

### Customizing Thresholds

Edit `config/actionability-thresholds.json`:
```json
{
  "actionable": 70,
  "partially_actionable": 40,
  "vanity": 0
}
```

## See Also

- `/check-trust-erosion` - Detect trust issues
- `/analyze-decay-risk` - Predict abandonment
- `/audit-reports` - Comprehensive usage audit
- `scripts/lib/dashboard-quality-validator.js` - Technical quality scoring
- `config/decision-kpi-matrix.json` - Persona decision mapping
- `docs/REPORT_HEALTH_SCORE_RUBRIC.md` - Scoring methodology

---

**Version**: 1.0.0
**Last Updated**: 2026-01-15
**Author**: RevPal Engineering
