---
name: gtm-revenue-modeling
description: Revenue modeling methodology including ARR waterfall, scenario planning, and projection models. Use when building revenue models, forecasting, or planning GTM strategy.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-gtm-planning:gtm-revenue-modeler
context:
  fork: true
  state-keys:
    - model-inputs
    - scenario-results
    - waterfall-data
---

# GTM Revenue Modeling

## When to Use This Skill

- Building ARR/MRR revenue models
- Creating scenario plans (base/upside/downside)
- Constructing ARR waterfall analyses
- Multi-year revenue projections
- Capacity planning tied to revenue targets

## Quick Reference

### Revenue Model Types

| Model | Use Case | Complexity |
|-------|----------|------------|
| ARR Waterfall | Analyze YoY changes | Medium |
| Cohort Analysis | Track cohort performance | Medium |
| Scenario Planning | Model multiple outcomes | High |
| Bottoms-Up | Build from unit economics | High |
| Top-Down | Start from market size | Medium |

### ARR Waterfall Components

| Component | Calculation |
|-----------|-------------|
| Beginning ARR | Prior period ending ARR |
| + New Business | New logo ARR |
| + Expansion | Upsell + Cross-sell |
| - Contraction | Downgrades |
| - Churn | Lost customers |
| = Ending ARR | Sum of above |

### Scenario Framework

| Scenario | Probability | Use |
|----------|-------------|-----|
| Base | 50% | Expected outcome |
| Upside | 25% | Optimistic outcome |
| Downside | 25% | Conservative outcome |

### Commands

```bash
/gtm-revenue-model --org <alias>           # Build model
/gtm-scenario --model <id> --type upside   # Generate scenario
/gtm-arr-waterfall --period 2026           # Create waterfall
```

## ARR Waterfall Construction

### Data Sources

```yaml
Beginning ARR:
  source: Prior period Closed Won (Status = Active)
  calculation: SUM(ARR) WHERE ContractEndDate > PeriodStart

New Business:
  source: Opportunities (New Business Type)
  calculation: SUM(ARR) WHERE CloseDate IN Period AND IsWon

Expansion:
  source: Opportunities (Expansion Type)
  calculation: SUM(ARR) WHERE CloseDate IN Period AND IsWon AND Account.IsExisting

Contraction:
  source: Contract Modifications
  calculation: SUM(ARR_Decrease) WHERE EffectiveDate IN Period

Churn:
  source: Churned Accounts
  calculation: SUM(Lost_ARR) WHERE ChurnDate IN Period
```

### SOQL Queries

```sql
-- Beginning ARR
SELECT SUM(AnnualContractValue__c)
FROM Contract
WHERE Status = 'Activated'
AND StartDate < 2026-01-01
AND EndDate >= 2026-01-01

-- New Business
SELECT SUM(Amount * 12 / Contract_Months__c) as ARR
FROM Opportunity
WHERE Type = 'New Business'
AND IsWon = true
AND CloseDate >= 2026-01-01 AND CloseDate < 2027-01-01

-- Expansion
SELECT SUM(Amount * 12 / Contract_Months__c) as ARR
FROM Opportunity
WHERE Type = 'Expansion'
AND IsWon = true
AND CloseDate >= 2026-01-01 AND CloseDate < 2027-01-01
```

## Scenario Planning

### Input Variables

| Variable | Base | Upside | Downside |
|----------|------|--------|----------|
| New Logo Win Rate | 25% | 30% | 20% |
| Expansion Rate | 15% | 20% | 10% |
| Churn Rate | 10% | 8% | 15% |
| Average Deal Size | $50K | $60K | $40K |
| Sales Cycle (days) | 90 | 75 | 110 |

### Scenario Calculation

```javascript
const calculateScenario = (inputs) => {
    const {
        beginningARR,
        newLeads,
        winRate,
        avgDealSize,
        expansionRate,
        churnRate
    } = inputs;

    const newBusiness = newLeads * winRate * avgDealSize;
    const expansion = beginningARR * expansionRate;
    const churn = beginningARR * churnRate;

    return {
        beginningARR,
        newBusiness,
        expansion,
        churn,
        endingARR: beginningARR + newBusiness + expansion - churn,
        netNewARR: newBusiness + expansion - churn,
        growthRate: (newBusiness + expansion - churn) / beginningARR
    };
};
```

### Probability-Weighted Forecast

```javascript
const weightedForecast = (base, upside, downside) => {
    return {
        expected: base * 0.50 + upside * 0.25 + downside * 0.25,
        range: { low: downside, high: upside }
    };
};
```

## Multi-Year Projection

### Year-Over-Year Model

```javascript
const projectMultiYear = (year1, assumptions, years = 5) => {
    const projections = [year1];

    for (let i = 1; i < years; i++) {
        const prev = projections[i - 1];
        const year = {
            beginningARR: prev.endingARR,
            newBusiness: prev.newBusiness * (1 + assumptions.newBusinessGrowth),
            expansion: prev.endingARR * assumptions.expansionRate,
            churn: prev.endingARR * assumptions.churnRate
        };
        year.endingARR = year.beginningARR + year.newBusiness + year.expansion - year.churn;
        projections.push(year);
    }

    return projections;
};
```

### Key Assumptions

| Assumption | Typical Range | Source |
|------------|---------------|--------|
| New Business Growth | 10-30% YoY | Pipeline analysis |
| Expansion Rate | 10-20% of ARR | Historical performance |
| Churn Rate | 5-15% of ARR | Cohort analysis |
| Sales Productivity | $500K-$1M/rep | Benchmark data |

## Capacity Planning

### Rep Capacity Model

```javascript
const calculateCapacity = (target, productivity) => {
    const {
        targetARR,
        avgProductivity,
        rampTime,
        attritionRate
    } = inputs;

    // Account for ramp and attrition
    const effectiveProductivity = avgProductivity * (1 - rampTime/12) * (1 - attritionRate/2);

    return {
        repsNeeded: Math.ceil(targetARR / effectiveProductivity),
        hiresNeeded: Math.ceil(targetARR / effectiveProductivity * (1 + attritionRate))
    };
};
```

### Productivity Benchmarks

| Role | Annual Quota | Typical Attainment |
|------|--------------|-------------------|
| AE (Enterprise) | $800K-$1.2M | 70-80% |
| AE (Mid-Market) | $500K-$800K | 75-85% |
| AE (SMB) | $300K-$500K | 80-90% |
| SDR (Meetings) | 15-20/month | 70-80% |

## Output Formats

### Executive Summary
```
Revenue Model: FY2026
━━━━━━━━━━━━━━━━━━━━
Beginning ARR:    $10.0M
+ New Business:   $ 4.0M
+ Expansion:      $ 1.5M
- Churn:          $ 1.0M
━━━━━━━━━━━━━━━━━━━━
Ending ARR:       $14.5M
Growth Rate:      45%
```

### Scenario Comparison
```
                Base     Upside   Downside
Beginning       $10.0M   $10.0M   $10.0M
New Business    $ 4.0M   $ 5.2M   $ 3.2M
Expansion       $ 1.5M   $ 2.0M   $ 1.0M
Churn           $ 1.0M   $ 0.8M   $ 1.5M
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ending ARR      $14.5M   $16.4M   $12.7M
Growth          45%      64%      27%
```

## Detailed Documentation

See supporting files:
- `waterfall-construction.md` - Detailed waterfall methodology
- `scenario-templates.md` - Scenario configuration templates
- `benchmarks.md` - Industry benchmark data
