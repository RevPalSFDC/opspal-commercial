---
name: gtm-revenue-model
description: Generate multi-year ARR projections with driver-based forecasting
argument-hint: "[--years 5] [--base-growth 30] [--scenarios upside,base,downside]"
---

# Multi-Year Revenue Model Generator

Generate 3-5 year ARR projections with Monte Carlo simulation for confidence intervals.

## Usage

```
/gtm-revenue-model [options]
```

## Options

- `--years` - Projection horizon (default: 5)
- `--base-growth` - Base case growth rate % (default: 30)
- `--scenarios` - Include scenarios (default: upside,base,downside)
- `--monte-carlo` - Run Monte Carlo simulation (default: true)
- `--iterations` - Simulation iterations (default: 1000)

## Key Assumptions

The model uses driver-based assumptions:
- **Growth Rate** - New business growth trajectory
- **Churn Rate** - Annual customer attrition
- **Expansion Rate** - Upsell/cross-sell multiplier
- **ASP** - Average selling price trends

## Output

### Projection Table
| Year | Upside | Base | Downside |
|------|--------|------|----------|
| 2026 | $14M   | $13M | $11.5M   |
| 2027 | $19.6M | $16.9M | $13.2M |
| ... | ... | ... | ... |

### Confidence Intervals
- P10 (Downside): 10th percentile outcome
- P50 (Base): Median expected outcome
- P90 (Upside): 90th percentile outcome

### Sensitivity Analysis
Identifies which assumptions have the largest impact on projections.

## Example

```bash
# 5-year projection with aggressive assumptions
/gtm-revenue-model --years 5 --base-growth 40

# Conservative 3-year model
/gtm-revenue-model --years 3 --base-growth 20 --scenarios base,downside
```

---

This command routes to the `gtm-revenue-modeler` agent.
