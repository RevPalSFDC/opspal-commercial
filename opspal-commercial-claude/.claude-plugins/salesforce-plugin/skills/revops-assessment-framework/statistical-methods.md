# Statistical Methods for Pipeline Analysis

## Funnel Analysis

### Stage Conversion Calculation

```javascript
const calculateConversionRates = async (opportunities) => {
  const stages = ['Qualification', 'Discovery', 'Proposal', 'Negotiation', 'Closed Won'];
  const conversionRates = {};

  for (let i = 0; i < stages.length - 1; i++) {
    const currentStage = stages[i];
    const nextStage = stages[i + 1];

    const atCurrent = opportunities.filter(o => o.reachedStage(currentStage)).length;
    const reachedNext = opportunities.filter(o => o.reachedStage(nextStage)).length;

    conversionRates[`${currentStage}_to_${nextStage}`] = {
      rate: atCurrent > 0 ? (reachedNext / atCurrent * 100).toFixed(1) : 0,
      numerator: reachedNext,
      denominator: atCurrent
    };
  }

  return conversionRates;
};
```

### Velocity Analysis

```javascript
const calculateVelocity = (opportunities) => {
  const closedWon = opportunities.filter(o => o.IsWon);

  const velocityMetrics = {
    avgDaysToClose: mean(closedWon.map(o => o.daysInPipeline)),
    medianDaysToClose: median(closedWon.map(o => o.daysInPipeline)),
    stdevDaysToClose: standardDeviation(closedWon.map(o => o.daysInPipeline)),
    p90DaysToClose: percentile(closedWon.map(o => o.daysInPipeline), 90)
  };

  return velocityMetrics;
};
```

## Statistical Functions

### Mean Calculation
```javascript
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
```

### Standard Deviation
```javascript
const standardDeviation = (values) => {
  const avg = mean(values);
  const squareDiffs = values.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squareDiffs));
};
```

### Percentile Calculation
```javascript
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * (p / 100)) - 1;
  return sorted[Math.max(0, index)];
};
```

## Cohort Analysis

### Win Rate by Cohort

```javascript
const analyzeWinRateByCohort = (opportunities, cohortField) => {
  const cohorts = {};

  opportunities.forEach(opp => {
    const cohort = opp[cohortField] || 'Unknown';
    if (!cohorts[cohort]) {
      cohorts[cohort] = { total: 0, won: 0 };
    }
    cohorts[cohort].total++;
    if (opp.IsWon) cohorts[cohort].won++;
  });

  return Object.entries(cohorts).map(([name, data]) => ({
    cohort: name,
    totalOpps: data.total,
    wonOpps: data.won,
    winRate: ((data.won / data.total) * 100).toFixed(1)
  }));
};
```

## Trend Analysis

### Moving Average

```javascript
const movingAverage = (values, window = 4) => {
  return values.map((_, idx, arr) => {
    if (idx < window - 1) return null;
    const slice = arr.slice(idx - window + 1, idx + 1);
    return mean(slice);
  }).filter(v => v !== null);
};
```

### Year-over-Year Comparison

```javascript
const calculateYoY = (currentPeriod, priorPeriod) => {
  if (!priorPeriod || priorPeriod === 0) return null;
  return ((currentPeriod - priorPeriod) / priorPeriod * 100).toFixed(1);
};
```

## Sampling Guidelines

For large datasets (>100k records):

| Dataset Size | Sample Size | Confidence Level |
|--------------|-------------|------------------|
| 100k-500k | 5,000 | 95% (±1.4%) |
| 500k-1M | 10,000 | 95% (±1.0%) |
| >1M | 15,000 | 95% (±0.8%) |

```javascript
const getRandomSample = (records, sampleSize) => {
  const shuffled = [...records].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, sampleSize);
};
```
