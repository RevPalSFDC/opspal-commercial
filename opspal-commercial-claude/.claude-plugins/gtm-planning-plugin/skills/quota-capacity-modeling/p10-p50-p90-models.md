# P10/P50/P90 Scenario Modeling

## Monte Carlo Methodology

### Stochastic Variables

```javascript
const distributions = {
  winRate: normal(0.234, 0.03),        // mean=23.4%, stddev=3%
  avgDealSize: normal(53000, 8000),    // mean=$53K, stddev=$8K
  salesCycleDays: normal(87, 15),      // mean=87d, stddev=15d
  discountRate: normal(0.10, 0.02),    // mean=10%, stddev=2%
  productivityPerRep: normal(688000, 95000),
  attritionRate: uniform(0.05, 0.15),  // 5-15% annual
  hireStartDelay: uniform(0, 14)       // 0-14 days delay
};
```

### Simulation Process

```javascript
const runMonteCarlo = (iterations = 10000) => {
  const results = [];

  for (let i = 0; i < iterations; i++) {
    const params = {
      winRate: distributions.winRate.sample(),
      avgDealSize: distributions.avgDealSize.sample(),
      salesCycleDays: distributions.salesCycleDays.sample(),
      discountRate: distributions.discountRate.sample(),
      productivityPerRep: distributions.productivityPerRep.sample(),
      attritionRate: distributions.attritionRate.sample(),
      hireStartDelay: distributions.hireStartDelay.sample()
    };

    const annualBookings = calculateAnnualCapacity(params);
    results.push(annualBookings);
  }

  return {
    p10: percentile(results, 10),
    p50: percentile(results, 50),
    p90: percentile(results, 90),
    mean: average(results),
    stddev: standardDeviation(results)
  };
};
```

### Python Implementation

```python
import numpy as np
from scipy.stats import norm, uniform

def monte_carlo_capacity(params, iterations=10000):
    win_rate = norm(params['win_rate_mean'], params['win_rate_std']).rvs(iterations)
    deal_size = norm(params['deal_size_mean'], params['deal_size_std']).rvs(iterations)
    productivity = norm(params['productivity_mean'], params['productivity_std']).rvs(iterations)

    bookings = []
    for i in range(iterations):
        annual = calculate_capacity(
            win_rate=win_rate[i],
            deal_size=deal_size[i],
            productivity=productivity[i]
        )
        bookings.append(annual)

    return {
        'p10': np.percentile(bookings, 10),
        'p50': np.percentile(bookings, 50),
        'p90': np.percentile(bookings, 90),
        'mean': np.mean(bookings),
        'confidence_interval': (np.percentile(bookings, 5), np.percentile(bookings, 95))
    }
```

## Output Format

### Scenario Catalog

```markdown
# Scenario Catalog - FY26 GTM Planning

## Base Scenario (Deterministic)
- **Target**: $50.0M
- **Capacity**: $48.2M
- **Gap**: -$1.8M (-3.6%)
- **Action**: Increase hiring by 2 AEs or improve productivity 5%

## Probabilistic Scenarios (Monte Carlo, 10,000 iterations)

| Scenario | Probability | Annual Bookings | vs Target |
|----------|-------------|-----------------|-----------|
| **P10** (Pessimistic) | 10% | $42.1M | -15.8% |
| **P50** (Most Likely) | 50% | $49.3M | -1.4% |
| **P90** (Optimistic) | 90% | $57.8M | +15.6% |

**Interpretation**:
- 50% chance of hitting $49.3M (within 2% of target)
- 90% confidence interval: $42.1M - $57.8M
- Risk of missing target by >10%: ~20%
```

### Variance Decomposition

```markdown
## Variance Decomposition (P50 vs Base)

| Factor | Contribution to Variance |
|--------|-------------------------|
| Win rate variability | 35% |
| Deal size variability | 28% |
| Productivity per rep | 22% |
| Hiring timing delays | 10% |
| Attrition | 5% |

**Recommendation**: Focus on win rate improvement (highest leverage)
```

## Confidence Levels

### Definition

| Level | Score | Criteria |
|-------|-------|----------|
| HIGH | >80% | 24+ months history, validated assumptions |
| MEDIUM | 60-80% | 12+ months history, some assumptions |
| LOW | <60% | <12 months history, mostly benchmarks |
| SYNTHETIC | - | Test data only, not for decisions |

### Calculation

```javascript
const calculateConfidence = (data) => {
  let score = 0;

  // Historical data availability (40 points)
  if (data.months_of_history >= 24) score += 40;
  else if (data.months_of_history >= 12) score += 25;
  else if (data.months_of_history >= 6) score += 10;

  // Data completeness (30 points)
  if (data.field_completeness >= 95) score += 30;
  else if (data.field_completeness >= 85) score += 20;
  else if (data.field_completeness >= 75) score += 10;

  // Assumption validation (30 points)
  if (data.assumptions_validated >= 80) score += 30;
  else if (data.assumptions_validated >= 50) score += 15;
  else if (data.assumptions_validated >= 25) score += 5;

  if (score >= 80) return 'HIGH';
  if (score >= 60) return 'MEDIUM';
  return 'LOW';
};
```

## Back-Testing

### Methodology

```markdown
# Back-Test: FY25 Predicted vs Actual

## Summary
- **P50 Prediction**: $11.8M
- **Actual Result**: $12.4M
- **Variance**: -$600K (-4.8%)
- **Status**: ✅ PASS (≤15% threshold)

## Variance Bridge
| Source | Impact |
|--------|--------|
| Win rate (assumed 23%, actual 23.4%) | -$300K |
| Deal size (assumed $50K, actual $53K) | -$200K |
| Ramp curve (faster than assumed) | -$100K |

## Calibration Adjustments for FY26
- Update win rate assumption to 23.4%
- Update deal size to $53K
- Adjust ramp curve based on actual Q4 FY25 data
```

### Acceptance Criteria

- Back-test variance ≤15%
- Variance sources identified and documented
- Calibration adjustments proposed
