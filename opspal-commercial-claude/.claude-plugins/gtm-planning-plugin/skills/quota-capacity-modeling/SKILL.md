---
name: quota-capacity-modeling
description: Quota and capacity modeling methodology with Monte Carlo simulations and P10/P50/P90 scenarios. Use when building quota models, running scenario analysis, calculating pipeline coverage, performing sensitivity analysis, back-testing against historical data, or validating hiring plans.
allowed-tools: Read, Grep, Glob
---

# Quota Capacity Modeling

## When to Use This Skill

- Building quota and capacity models
- Running Monte Carlo simulations for P10/P50/P90 scenarios
- Calculating pipeline coverage requirements
- Performing sensitivity analysis (7 variables)
- Back-testing models against historical data
- Validating hiring plans and ramp curves

## Quick Reference

### Quality Targets

| Metric | Target | Alert |
|--------|--------|-------|
| Scenario sum vs targets | ±2% | >5% |
| Back-test variance | ≤15% | >20% |
| P10-P90 range | P10 ≥ 70% of P50 | <60% |
| Hiring constraints | 100% respected | Any violation |

### Monte Carlo Outputs

```
P10 (Pessimistic): 10th percentile outcome
P50 (Most Likely): 50th percentile (median)
P90 (Optimistic): 90th percentile outcome

Interpretation:
- 50% chance of achieving P50 or better
- 90% confidence interval: P10 to P90
- Risk of missing target: Calculate from distribution
```

### Sensitivity Variables (7)

1. Hiring timing (+/- 30 days)
2. Ramp curve (+/- 20%)
3. Productivity per rep (+/- 15%)
4. Win rate (18% - 29%)
5. Average deal size ($45K - $61K)
6. Discount rate (5% - 15%)
7. Seasonality (+/- 10%)

## Detailed Documentation

See supporting files:
- `p10-p50-p90-models.md` - Scenario modeling
- `ramp-patterns.md` - Rep ramp modeling
- `coverage-ratios.md` - Pipeline coverage
- `seasonality-factors.md` - Seasonal adjustments
