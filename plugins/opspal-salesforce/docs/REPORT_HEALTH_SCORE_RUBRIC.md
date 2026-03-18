# Report & Dashboard Health Score Rubric

> **Version**: 1.0.0
> **Last Updated**: 2026-01-15
> **Related Files**:
> - `scripts/lib/report-intelligence-diagnostics.js` - Health scoring implementation
> - `scripts/lib/dashboard-quality-validator.js` - Dashboard quality scoring
> - `config/decision-kpi-matrix.json` - Actionability criteria
> - `config/persona-kpi-contracts.json` - Persona requirements

## Overview

The Health Score Rubric provides a standardized framework for evaluating Salesforce reports and dashboards. Scores help teams:
- Prioritize which reports need improvement
- Identify systemic quality issues
- Gate deployments by governance tier
- Track quality improvements over time

---

## Score Ranges

### Letter Grade Mapping

| Grade | Score Range | Status | Description |
|-------|-------------|--------|-------------|
| **A+** | 95-100 | Excellent | Best-in-class, no action needed |
| **A** | 90-94 | Excellent | Minor polish only |
| **A-** | 85-89 | Good | Production-ready |
| **B+** | 80-84 | Good | Acceptable with minor improvements |
| **B** | 75-79 | Acceptable | Passes minimum quality |
| **B-** | 70-74 | Acceptable | At threshold, improvements recommended |
| **C+** | 65-69 | Below Standard | Does not meet quality bar |
| **C** | 60-64 | Below Standard | Significant issues |
| **C-** | 55-59 | Poor | Major rework needed |
| **D** | 50-54 | Poor | Fundamental problems |
| **F** | 0-49 | Failing | Should not be deployed |

### Minimum Quality Threshold

**Reports and dashboards must score ≥70 (B- or higher) to pass quality gates.**

---

## Governance Tier Requirements

Different governance tiers have different quality requirements based on their business impact.

| Governance Tier | Description | Min Score | Pass Criteria |
|-----------------|-------------|-----------|---------------|
| **Tier 0: Personal** | Individual-use reports | 50 | D or higher |
| **Tier 1: Team** | Team-level metrics | 60 | C or higher |
| **Tier 2: Executive/Finance** | Leadership dashboards | 80 | B+ or higher |
| **Tier 3: System-of-Record** | Source-of-truth reports | 90 | A or higher |

### Tier Determination Factors

A report/dashboard's tier is determined by:
1. **Folder location** (Personal → Public → Executive)
2. **Sharing scope** (Private → Group → Organization)
3. **Explicit annotation** (`governanceTier` in description)
4. **Usage patterns** (executive viewers, frequency)

---

## Health Score Dimensions

### Report Health Score (4 Dimensions)

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| **Clarity** | 30% | Naming, descriptions, filter labels, documentation |
| **Correctness Risk** | 30% | Metric definition accuracy, filter logic, row limit safety |
| **Performance Risk** | 20% | Query complexity, row estimates, filter optimization |
| **Reusability** | 20% | Dashboard embedding, cross-report consistency, standardization |

### Dashboard Quality Score (8 Dimensions)

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| **Component Count** | 15% | Optimal range (5-7), cognitive load management |
| **Naming Convention** | 10% | Clear titles, descriptive component names |
| **Chart Appropriateness** | 20% | Correct chart types for data patterns |
| **Visual Hierarchy** | 15% | F-pattern placement, size variation, key metrics prominence |
| **Filter Usage** | 10% | Interactive filters, defaults, date range presence |
| **Performance** | 10% | Load time factors, row limits, refresh scheduling |
| **Audience Alignment** | 15% | Persona-appropriate detail level and components |
| **Actionability** | 15% | Targets, trends, drill-downs, guidance, ownership |

---

## Actionability Scoring (Deep Dive)

The actionability dimension determines whether metrics prompt action or are "vanity metrics."

### 5-Criteria Scoring System

| Criteria | Weight | Question |
|----------|--------|----------|
| **has_target** | 30% | Does the metric show a target or benchmark? |
| **has_trend** | 25% | Does the metric show trend direction? |
| **has_drill_down** | 20% | Can users drill down to investigate? |
| **has_action_guidance** | 15% | Is there guidance on what to do if metric is off? |
| **has_owner** | 10% | Is someone accountable for this metric? |

### Actionability Tiers

| Tier | Score | Meaning |
|------|-------|---------|
| **Actionable** | 70-100 | Metric drives decisions and actions |
| **Partially Actionable** | 40-69 | Some context, but missing key elements |
| **Vanity** | 0-39 | Looks good but doesn't prompt action |

### Common Vanity Metric Patterns

1. **High placement but no action trigger** - Prominent metric without threshold
2. **Same value on multiple dashboards** - Redundant without context
3. **No trend or comparison** - Current value without baseline
4. **Detail data on executive dashboard** - TMI for audience
5. **Metric without target** - No anchor for judgment

---

## How to Improve Scores

### Clarity Improvements (+5-15 points)

| Issue | Fix | Impact |
|-------|-----|--------|
| Vague name | Use `[Audience] [Topic] Dashboard` pattern | +5 |
| No description | Add 2-3 sentence purpose statement | +5 |
| Generic component titles | Use descriptive titles explaining what's shown | +3 per component |

### Correctness Risk Improvements (+10-30 points)

| Issue | Fix | Impact |
|-------|-----|--------|
| Row truncation risk | Use TABULAR format or add row filters | +10 |
| Ambiguous metric | Map to canonical metric definition | +15 |
| Date field confusion | Explicitly document date semantics | +5 |

### Performance Risk Improvements (+5-20 points)

| Issue | Fix | Impact |
|-------|-----|--------|
| >10 components | Split into focused dashboards | +10 |
| No row limits on tables | Add `rowLimit: 20-50` | +5 |
| Real-time refresh on large dashboard | Switch to hourly/daily | +5 |

### Actionability Improvements (+5-20 points)

| Issue | Fix | Impact |
|-------|-----|--------|
| No targets | Add benchmark values (quota=100%) | +6 per component |
| No trends | Add period comparison or trend line | +5 per component |
| No drill-down | Link to detail reports | +4 per component |
| No guidance | Add tooltip with action steps | +3 per component |

---

## Score Interpretation by Context

### For Report Creators

| Your Score | What It Means | Recommended Action |
|------------|---------------|-------------------|
| **90+** | Production-ready | Proceed to deployment |
| **80-89** | Good, minor issues | Fix warnings, then deploy |
| **70-79** | Acceptable baseline | Address top 3 recommendations |
| **60-69** | Below standard | Significant rework needed before deployment |
| **<60** | Fundamental problems | Redesign with stakeholder input |

### For Report Consumers

| Dashboard Score | Trust Level | Usage Guidance |
|-----------------|-------------|----------------|
| **A (90+)** | High confidence | Use for decisions |
| **B (70-89)** | Moderate confidence | Verify critical numbers independently |
| **C/D (<70)** | Low confidence | Cross-check before using in presentations |
| **F (<50)** | Do not use | Request replacement or improvement |

### For Governance Reviewers

| Tier | Expected Distribution | Red Flag |
|------|----------------------|----------|
| **Tier 3 (System-of-Record)** | 100% should be A | Any report below A needs immediate attention |
| **Tier 2 (Executive)** | 90%+ should be B+ | More than 10% below B+ indicates systemic issues |
| **Tier 1 (Team)** | 80%+ should be C+ | High failure rate suggests training need |
| **Tier 0 (Personal)** | Not monitored | Only flagged if shared unexpectedly |

---

## Automated Enforcement

### Pre-Deployment Validation

```bash
# Validate report before deployment
node scripts/lib/report-intelligence-diagnostics.js analyze \
  --report MyReport.json \
  --tier 2 \
  --strict

# Validate dashboard quality
node scripts/lib/dashboard-quality-validator.js \
  --dashboard MyDashboard.json \
  --format text
```

### CI/CD Gate Configuration

```yaml
# Example deployment gate
report_quality_gate:
  tier_0:
    min_score: 50
    block_on_fail: false
  tier_1:
    min_score: 60
    block_on_fail: true
  tier_2:
    min_score: 80
    block_on_fail: true
  tier_3:
    min_score: 90
    block_on_fail: true
    require_review: true
```

### Confidence-Based Actions

| Confidence Level | Action |
|-----------------|--------|
| **≥90%** | Auto-approve or auto-block based on score |
| **70-89%** | Require human review |
| **<70%** | Advisory only, log for analysis |

---

## Score Calculation Examples

### Example 1: Well-Designed Executive Dashboard

```
Components: 6 (optimal range)
Component Count Score: 100 (weight 15%) → 15 points
Naming Score: 90 (weight 10%) → 9 points
Chart Appropriateness: 95 (weight 20%) → 19 points
Visual Hierarchy: 85 (weight 15%) → 12.75 points
Filter Usage: 80 (weight 10%) → 8 points
Performance: 100 (weight 10%) → 10 points
Audience Alignment: 90 (weight 15%) → 13.5 points
Actionability: 75 (weight 15%) → 11.25 points

Total: 98.5 → Grade: A+
```

### Example 2: Poorly Designed Dashboard

```
Components: 12 (too many)
Component Count Score: 50 (weight 15%) → 7.5 points
Naming Score: 40 (weight 10%) → 4 points
Chart Appropriateness: 60 (weight 20%) → 12 points
Visual Hierarchy: 30 (weight 15%) → 4.5 points
Filter Usage: 20 (weight 10%) → 2 points
Performance: 40 (weight 10%) → 4 points
Audience Alignment: 50 (weight 15%) → 7.5 points
Actionability: 25 (weight 15%) → 3.75 points

Total: 45.25 → Grade: F
```

---

## Migration Quality Assessment

When migrating reports/dashboards, additional validation ensures the migration preserved business intent.

### Post-Migration Checklist

| Check | Auto-Validate | Tolerance |
|-------|---------------|-----------|
| Total sum match | Yes | ±1% |
| Row count reasonable | Yes | ±10% |
| Key records present | Manual | 100% required |
| Trend direction correct | Manual | Visual review |
| Drill-through works | Manual | 100% functional |
| Load time acceptable | Yes | Per format threshold |
| Targets present | Manual | Where expected |
| Documentation updated | Manual | Complete |

### Load Time Thresholds by Format

| Format | Target | Warning | Fail |
|--------|--------|---------|------|
| TABULAR | <2s | 2-5s | >5s |
| SUMMARY | <5s | 5-10s | >10s |
| MATRIX | <10s | 10-20s | >20s |
| DASHBOARD | <10s | 10-15s | >15s |

---

## Monitoring & Trends

### Health Score Trends to Track

1. **Org-wide average score** - Should trend upward over time
2. **Tier 2/3 compliance rate** - % meeting minimum thresholds
3. **Actionability average** - Indicates decision-support quality
4. **Vanity metric percentage** - Should decrease with governance

### Quality Alerts

Configure alerts for:
- New Tier 2/3 report scores below threshold
- Score drops >10 points after modification
- >30% of components flagged as vanity metrics
- Trust erosion signals (shadow report creation)

---

## Related Documentation

- `REPORT_INTELLIGENCE_AGENT_SPEC.md` - Agent behavior specification
- `METRIC_ONTOLOGY_GOVERNANCE.md` - Metric definition governance
- `config/migration-failure-taxonomy.json` - Migration failure patterns
- `config/decision-kpi-matrix.json` - Persona decision mapping

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-15 | Initial release with 4-dimension report scoring and 8-dimension dashboard scoring |
