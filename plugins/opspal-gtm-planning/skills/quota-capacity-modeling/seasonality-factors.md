# Seasonality Factors

## Standard Seasonality Patterns

### Quarterly Distribution

| Quarter | % of Annual | Factor | Notes |
|---------|-------------|--------|-------|
| Q1 | 22.6% | 0.90 | Post-holiday slow start |
| Q2 | 25.8% | 1.03 | Spring acceleration |
| Q3 | 19.4% | 0.78 | Summer slowdown |
| Q4 | 32.2% | 1.29 | Year-end push |

### Monthly Distribution

```javascript
const monthlySeasonality = {
  Jan: 0.85,   // Q1: Post-holiday recovery
  Feb: 0.90,
  Mar: 0.95,   // Q1 end push
  Apr: 1.00,   // Q2: Steady
  May: 1.05,
  Jun: 1.05,   // Q2 end push
  Jul: 0.75,   // Q3: Summer slump
  Aug: 0.75,
  Sep: 0.85,   // Q3: Back to business
  Oct: 1.10,   // Q4: Budget flush
  Nov: 1.20,
  Dec: 1.55    // Q4: Year-end close
};
```

## Industry Variations

### B2B SaaS

```yaml
B2B SaaS Seasonality:
  Q1: 20-23%
  Q2: 24-27%
  Q3: 18-21%
  Q4: 30-35%

  Key Drivers:
    - Budget cycles (calendar year)
    - Summer vacations
    - Year-end spending
    - Fiscal year alignment
```

### B2B Enterprise

```yaml
B2B Enterprise:
  Q1: 18-20%
  Q2: 22-25%
  Q3: 20-23%
  Q4: 35-40%

  Key Drivers:
    - Long sales cycles
    - Budget approval timing
    - Executive availability
    - Contract renewals
```

### Retail/E-commerce

```yaml
Retail Seasonality:
  Q1: 15-18%
  Q2: 20-23%
  Q3: 22-25%
  Q4: 35-45%

  Key Drivers:
    - Holiday season
    - Back-to-school
    - Major sales events
```

## Applying Seasonality

### Capacity Adjustment

```javascript
const applySeasonality = (baseCapacity, month) => {
  const seasonalFactor = monthlySeasonality[month];
  return baseCapacity * seasonalFactor;
};

// Example
const baseMonthlyCapacity = 4000000;  // $4M/month average
const januaryCapacity = applySeasonality(baseMonthlyCapacity, 'Jan');
// Result: $4M × 0.85 = $3.4M
```

### Quota Setting

```yaml
Quota Seasonality Adjustment:
  Approach 1: Even Quota
    - Same quarterly quota
    - Rep manages variability
    - Pro: Simple

  Approach 2: Seasonal Quota
    - Quota matches seasonality
    - More realistic targets
    - Pro: Better attainability

  Recommendation: Seasonal quota for AEs, even for SDRs
```

## Sensitivity Analysis

### Seasonality Range

```javascript
const sensitivityAnalysis = {
  variable: 'seasonality',
  baseValues: {Q1: 0.226, Q2: 0.258, Q3: 0.194, Q4: 0.322},

  scenarios: [
    {
      name: 'Flatter',
      values: {Q1: 0.24, Q2: 0.26, Q3: 0.22, Q4: 0.28},
      impact: '-$2.1M in Q4'
    },
    {
      name: 'Steeper',
      values: {Q1: 0.20, Q2: 0.25, Q3: 0.18, Q4: 0.37},
      impact: '+$2.8M in Q4'
    }
  ]
};
```

### Impact on Planning

| Scenario | Q4 Variance | Annual Impact |
|----------|-------------|---------------|
| Steeper Q4 | +15% | +4.8% annual |
| Flatter | -12% | -3.8% annual |
| Q3 improvement | +25% Q3 | +1.9% annual |

## Forecasting with Seasonality

### De-Seasonalized Run Rate

```javascript
const calculateRunRate = (ytdActual, currentMonth) => {
  // Calculate YTD seasonality factor
  const ytdSeasonalFactor = Object.values(monthlySeasonality)
    .slice(0, currentMonth)
    .reduce((sum, f) => sum + f, 0) / currentMonth;

  // De-seasonalize actual
  const adjustedActual = ytdActual / ytdSeasonalFactor;

  // Project full year
  const annualizedRun = adjustedActual * 12;

  return {
    ytdActual,
    adjustedActual,
    annualizedRun,
    method: 'de-seasonalized'
  };
};
```

### Seasonal Forecast

```markdown
## Q3 Forecast (Mid-Year)

### YTD Performance
| Metric | H1 Actual | H1 Target | Variance |
|--------|-----------|-----------|----------|
| Bookings | $24.2M | $24.4M | -0.8% |

### Full Year Projection
| Method | Projection | vs Target |
|--------|------------|-----------|
| Straight-line | $48.4M | -3.2% |
| De-seasonalized | $52.1M | +4.2% |
| **Weighted** | **$50.2M** | **+0.4%** |

Confidence: MEDIUM (seasonal patterns holding)
```

## Historical Pattern Analysis

### Year-over-Year Comparison

```sql
-- Analyze historical seasonality
SELECT
  QUARTER(close_date) AS quarter,
  YEAR(close_date) AS year,
  SUM(amount) AS bookings,
  SUM(amount) / annual_total AS pct_of_year
FROM opportunities
WHERE is_won = true
  AND close_date >= DATE_SUB(CURRENT_DATE, INTERVAL 3 YEAR)
GROUP BY quarter, year
ORDER BY year, quarter;
```

### Pattern Stability

```yaml
Seasonality Stability Check:
  Metric: Standard deviation of quarterly %

  Result:
    Q1: 22.6% ± 2.1%
    Q2: 25.8% ± 1.8%
    Q3: 19.4% ± 2.5%
    Q4: 32.2% ± 3.2%

  Assessment: Q4 most variable, Q2 most stable
  Recommendation: Use 3-year average, monitor Q4 closely
```
