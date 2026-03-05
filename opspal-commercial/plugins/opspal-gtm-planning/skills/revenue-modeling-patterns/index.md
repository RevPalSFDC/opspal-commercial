---
name: revenue-modeling-patterns
description: |
  Revenue modeling methodology for multi-year projections and scenario planning.
  Use when building ARR forecasts, running Monte Carlo simulations,
  or performing sensitivity analysis on growth assumptions.

  TRIGGER KEYWORDS: "revenue model", "arr projection", "scenario",
  "monte carlo", "sensitivity analysis", "forecast"
---

# Revenue Modeling Patterns

This skill provides methodology for driver-based revenue modeling, scenario planning, and Monte Carlo simulation for SaaS businesses.

## Driver-Based Modeling

### Core Growth Drivers

| Driver | Definition | Typical Range |
|--------|------------|---------------|
| New ARR Growth | YoY growth in new business | 20-100% |
| Expansion Rate | Upsell revenue as % of starting ARR | 10-30% |
| Gross Churn | Revenue lost as % of starting ARR | 5-20% |
| Net Retention | NRR = 100% - Churn + Expansion | 90-130% |

### Driver Relationships

```
Ending ARR = Starting ARR × NRR + New ARR

Where:
  NRR = 1 - Gross Churn Rate + Expansion Rate
  New ARR = Prior New ARR × (1 + New ARR Growth Rate)
```

### Multi-Year Projection Formula

```javascript
function projectARR(year, assumptions) {
  if (year === 0) return assumptions.starting_arr;

  const priorARR = projectARR(year - 1, assumptions);
  const retained = priorARR * (1 - assumptions.churn_rate);
  const expanded = priorARR * assumptions.expansion_rate;
  const newARR = assumptions.new_arr_base * Math.pow(1 + assumptions.new_growth, year);

  return retained + expanded + newARR;
}
```

## Scenario Planning

### Scenario Definitions

#### Upside Scenario
Favorable conditions exceed expectations:
- Win rates increase +5 percentage points
- Churn decreases -3 percentage points
- Expansion cycles accelerate
- Full hiring plan executes

#### Base Scenario
Current trajectory continues:
- Historical trends persist
- Planned investments realize
- Normal competitive environment

#### Downside Scenario
Adverse conditions materialize:
- Win rates decrease -5 percentage points
- Churn increases +5 percentage points
- Expansion cycles slow
- Hiring freezes occur

### Scenario Assumption Matrix

| Driver | Downside | Base | Upside |
|--------|----------|------|--------|
| New ARR Growth | 15% | 30% | 50% |
| Expansion Rate | 8% | 15% | 22% |
| Churn Rate | 15% | 10% | 6% |
| NRR | 93% | 105% | 116% |

## Monte Carlo Simulation

### Purpose
Generate probability distributions for projections by running many iterations with varied assumptions.

### Methodology

```javascript
function monteCarloProjection(baseCase, assumptions, iterations = 1000) {
  const results = [];

  for (let i = 0; i < iterations; i++) {
    // Vary each assumption within defined range
    const varied = {
      churn: varyNormal(assumptions.churn, assumptions.churn_stddev),
      expansion: varyNormal(assumptions.expansion, assumptions.expansion_stddev),
      growth: varyNormal(assumptions.growth, assumptions.growth_stddev)
    };

    const projection = projectARR(5, { ...baseCase, ...varied });
    results.push(projection);
  }

  return {
    p10: percentile(results, 10),   // Downside
    p25: percentile(results, 25),
    p50: percentile(results, 50),   // Base case
    p75: percentile(results, 75),
    p90: percentile(results, 90)    // Upside
  };
}
```

### Interpreting Results

| Percentile | Interpretation | Use Case |
|------------|----------------|----------|
| P10 | Downside - 90% chance of exceeding | Conservative planning |
| P50 | Median outcome | Base case target |
| P90 | Upside - 10% chance of exceeding | Stretch goals |

## Sensitivity Analysis

### Purpose
Identify which assumptions have the largest impact on projections.

### Methodology

1. Establish base case projection
2. Increase each assumption by 1%
3. Measure impact on Year 5 ARR
4. Rank by absolute impact

### Sensitivity Report Format

```
Key Driver Sensitivity (per 1% change):

1. Churn Rate:     -$1.2M impact
2. Win Rate:       +$0.8M impact
3. Expansion Rate: +$0.5M impact
4. ASP:            +$0.4M impact
5. Ramp Time:      -$0.2M impact
```

### Action Implications

| Sensitivity | Recommendation |
|-------------|----------------|
| Churn is #1 | Prioritize retention programs |
| Win Rate is #1 | Focus on sales enablement |
| Expansion is #1 | Invest in customer success |

## ARR Waterfall Construction

### Components

```
Starting ARR:      $10,000,000
+ New ARR:          $3,000,000  (new customers)
+ Expansion ARR:    $1,500,000  (upsells)
- Churned ARR:       -$800,000  (lost customers)
= Ending ARR:      $13,700,000
```

### Reconciliation Rule
```
Starting + New + Expansion - Churn = Ending
$10.0M + $3.0M + $1.5M - $0.8M = $13.7M ✓
```

### Visualization
Use waterfall chart with:
- Blue bars for totals (Starting, Ending)
- Green bars for increases (New, Expansion)
- Red bars for decreases (Churn)

## Best Practices

1. **Document Assumptions** - Every projection needs explicit assumptions
2. **Validate Against History** - Back-test models against prior periods
3. **Use Ranges, Not Points** - Present confidence intervals
4. **Update Quarterly** - Refresh assumptions as new data arrives
5. **Sensitivity Test** - Know which assumptions matter most
