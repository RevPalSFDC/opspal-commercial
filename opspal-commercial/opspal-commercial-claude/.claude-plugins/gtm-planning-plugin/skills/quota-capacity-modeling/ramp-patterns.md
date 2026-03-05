# Rep Ramp Patterns

## Standard Ramp Curves

### By Role

| Role | Month 1 | Month 2 | Month 3 | Month 4 | Month 5 | Full Ramp |
|------|---------|---------|---------|---------|---------|-----------|
| AE | 0% | 40% | 70% | 85% | 100% | 5 months |
| SDR | 0% | 60% | 90% | 100% | 100% | 4 months |
| CSM | 0% | 50% | 80% | 100% | 100% | 4 months |
| SE | 0% | 30% | 60% | 85% | 100% | 5 months |

### Visual Representation

```
100% ─────────────────────────────● AE (Month 5)
                              ● SDR (Month 4)
 80% ─────────────────────●───────
                      ●
 60% ─────────────●───────────────
              ●
 40% ─────●───────────────────────
      ●
  0% ●────┬────┬────┬────┬────┬────
     M1   M2   M3   M4   M5   M6
```

## Capacity Calculation

### Base Formula

```javascript
const calculateCapacity = (month, role) => {
  const startingHC = inputs.currentHeadcount[role];
  const hiresThisMonth = getHiresForMonth(month, role);
  const rampedHC = calculateRampedHC(startingHC, hiresThisMonth, rampCurves[role]);

  const monthlyProductivity = inputs.avgProductivityPerRep[role] / 12;
  const seasonalFactor = inputs.seasonalityFactors[getQuarter(month)];

  return rampedHC * monthlyProductivity * seasonalFactor;
};
```

### Ramped Headcount

```javascript
const calculateRampedHC = (starting, newHires, rampCurve) => {
  // Existing headcount = 100% productive
  let totalProductivity = starting;

  // New hires = productivity based on ramp stage
  for (const hire of newHires) {
    const monthsOnJob = calculateMonthsOnJob(hire.startDate);
    const rampIndex = Math.min(monthsOnJob, rampCurve.length - 1);
    const productivity = rampCurve[rampIndex] / 100;
    totalProductivity += productivity;
  }

  return totalProductivity;
};
```

## Hiring Plan Impact

### Timing Sensitivity

```yaml
Hiring Timing Impact:
  30 days earlier:
    - Additional capacity: +$3.0M (+6.2%)
    - Recommendation: Accelerate recruiting

  Baseline:
    - Capacity: $48.2M

  30 days later:
    - Reduced capacity: -$2.4M (-5.0%)
    - Risk: May miss targets
```

### Attrition Modeling

```javascript
const modelAttrition = (headcount, attritionRate, month) => {
  // Attrition typically higher in Q1 (post-bonus) and Q3
  const seasonalAttrition = {
    Q1: attritionRate * 1.3,  // 30% higher
    Q2: attritionRate * 0.9,
    Q3: attritionRate * 1.1,
    Q4: attritionRate * 0.7   // 30% lower
  };

  const quarter = getQuarter(month);
  const monthlyRate = seasonalAttrition[quarter] / 12;

  return Math.floor(headcount * monthlyRate);
};
```

## Ramp Curve Variations

### Aggressive Ramp (High-Support Model)

```yaml
Aggressive Ramp:
  Conditions:
    - Dedicated onboarding program
    - 1:1 mentorship
    - Reduced quota in ramp

  Curve (AE):
    Month 1: 20%
    Month 2: 50%
    Month 3: 80%
    Month 4: 100%

  Impact: +$1.2M capacity (+2.5%)
```

### Conservative Ramp (Complex Product)

```yaml
Conservative Ramp:
  Conditions:
    - Complex product
    - Long sales cycle
    - Technical certification required

  Curve (AE):
    Month 1: 0%
    Month 2: 20%
    Month 3: 40%
    Month 4: 60%
    Month 5: 80%
    Month 6: 100%

  Impact: -$1.5M capacity (-3.1%)
```

### Industry Benchmarks

| Industry | Avg AE Ramp | Productivity Range |
|----------|-------------|-------------------|
| SaaS (SMB) | 3-4 months | $400K-$600K |
| SaaS (MM) | 4-5 months | $600K-$900K |
| SaaS (ENT) | 6-9 months | $800K-$1.5M |
| Hardware | 6-12 months | $500K-$1M |
| Services | 4-6 months | $300K-$600K |

## Ramp Investment Analysis

### Cost During Ramp

```yaml
Ramp Period Costs:
  Salary + Benefits: $15,000/month
  Training: $5,000 (one-time)
  Tools/Licenses: $500/month
  Manager time: $2,000/month (estimated)

  Total 5-month ramp cost: $92,500

Breakeven Analysis:
  At $688K annual productivity:
    - Monthly contribution: $57,333
    - Breakeven: Month 6-7 post-hire
    - 12-month ROI: 4.5x
```

### Ramp vs Capacity Trade-off

```markdown
## Hiring Decision Framework

| Scenario | Hire Now | Wait 3 Months |
|----------|----------|---------------|
| Q1 Capacity | $0 | $0 |
| Q2 Capacity | $50K | $0 |
| Q3 Capacity | $180K | $50K |
| Q4 Capacity | $200K | $180K |
| **Full Year** | **$430K** | **$230K** |

Decision: Hiring 3 months earlier = +$200K capacity (+87%)
```
