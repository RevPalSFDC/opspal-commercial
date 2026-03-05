# Pipeline Coverage Ratios

## Coverage Calculation

### Formula

```javascript
const calculatePipelineCoverage = (segment) => {
  const quota = inputs.topDownTargets.bySegment[segment];
  const winRate = historicalWinRate[segment];
  const pipelineNeeded = quota / winRate;

  return {
    segment,
    quota,
    win_rate: winRate,
    pipeline_needed: pipelineNeeded,
    coverage_ratio: pipelineNeeded / quota
  };
};
```

### Standard Coverage by Segment

| Segment | Win Rate | Required Coverage | Pipeline Needed |
|---------|----------|-------------------|-----------------|
| Enterprise | 28.1% | 3.6× | $106.8M for $30M quota |
| Mid-Market | 21.3% | 4.7× | $70.4M for $15M quota |
| SMB | 18.7% | 5.3× | $26.7M for $5M quota |

## Coverage by Stage

### Weighted Pipeline

```yaml
Stage Weights:
  Discovery: 10%
  Qualification: 20%
  Solution: 40%
  Proposal: 60%
  Negotiation: 80%
  Commit: 90%

Weighted Pipeline = Σ (Stage Amount × Stage Weight)
```

### Stage-Based Coverage

| Stage | Amount | Weight | Weighted |
|-------|--------|--------|----------|
| Discovery | $10M | 10% | $1M |
| Qualification | $8M | 20% | $1.6M |
| Solution | $5M | 40% | $2M |
| Proposal | $3M | 60% | $1.8M |
| Negotiation | $2M | 80% | $1.6M |
| Commit | $1M | 90% | $0.9M |
| **Total** | **$29M** | - | **$8.9M** |

## Time-Based Coverage

### Coverage by Close Date

```yaml
Pipeline Timing:
  Current Quarter:
    - Close Date ≤ 90 days
    - Expected Coverage: 3×
    - Minimum: 2.5×

  Next Quarter:
    - Close Date 91-180 days
    - Expected Coverage: 2×
    - Minimum: 1.5×

  Future Quarters:
    - Close Date > 180 days
    - Expected Coverage: 1×
    - Quality varies
```

### Pipeline Velocity

```javascript
const calculateVelocity = (segment) => {
  return {
    avgDealSize: historicalAvgDeal[segment],
    salesCycle: historicalCycle[segment],
    winRate: historicalWinRate[segment],

    // Velocity = (Deals × Win Rate × Avg Deal) / Sales Cycle
    monthlyVelocity: (deals * winRate * avgDeal) / (salesCycle / 30)
  };
};
```

## Coverage Health Indicators

### Traffic Light System

```yaml
Coverage Health:
  Green (Healthy):
    - Total: ≥3.5× quota
    - Weighted: ≥2× quota
    - Current Quarter: ≥2.5× remaining

  Yellow (Watch):
    - Total: 2.5-3.5× quota
    - Weighted: 1.5-2× quota
    - Action: Increase prospecting

  Red (Critical):
    - Total: <2.5× quota
    - Weighted: <1.5× quota
    - Action: Emergency pipeline generation
```

### Coverage Gap Analysis

```markdown
## Coverage Gap Analysis

### Current State
| Metric | Actual | Required | Gap |
|--------|--------|----------|-----|
| Total Pipeline | $80M | $100M | -$20M |
| Weighted Pipeline | $32M | $40M | -$8M |
| Q1 Coverage | 2.2× | 3.0× | -0.8× |

### Gap Closure Plan
| Action | Expected Pipeline | Timeline |
|--------|-------------------|----------|
| Outbound campaign | +$5M | 60 days |
| Partner referrals | +$3M | 90 days |
| Marketing events | +$8M | 90 days |
| Product-led | +$4M | 60 days |
```

## Coverage by Source

### Source Mix Analysis

```yaml
Pipeline Sources:
  Inbound:
    - Target: 30% of pipeline
    - Win Rate: 25%
    - Coverage needed: 4×

  Outbound:
    - Target: 40% of pipeline
    - Win Rate: 18%
    - Coverage needed: 5.5×

  Partner:
    - Target: 20% of pipeline
    - Win Rate: 30%
    - Coverage needed: 3.3×

  Expansion:
    - Target: 10% of pipeline
    - Win Rate: 45%
    - Coverage needed: 2.2×
```

### Blended Coverage

```javascript
const calculateBlendedCoverage = () => {
  const sources = [
    { name: 'Inbound', mix: 0.30, winRate: 0.25 },
    { name: 'Outbound', mix: 0.40, winRate: 0.18 },
    { name: 'Partner', mix: 0.20, winRate: 0.30 },
    { name: 'Expansion', mix: 0.10, winRate: 0.45 }
  ];

  const blendedWinRate = sources.reduce((sum, s) =>
    sum + (s.mix * s.winRate), 0);

  const blendedCoverage = 1 / blendedWinRate;

  return {
    blendedWinRate,        // 23.4%
    blendedCoverage,       // 4.27×
    bySource: sources.map(s => ({
      ...s,
      coverage: 1 / s.winRate
    }))
  };
};
```

## Coverage Forecasting

### Pipeline Aging

```yaml
Pipeline Aging Rules:
  <30 days old:
    - Weight: 100%
    - Confidence: HIGH

  30-60 days old:
    - Weight: 80%
    - Confidence: MEDIUM

  60-90 days old:
    - Weight: 60%
    - Confidence: LOW

  >90 days old:
    - Weight: 40%
    - Action: Review for quality
```

### Coverage Trend

```markdown
## Coverage Trend (Rolling 4 Quarters)

| Quarter | Coverage | Win Rate | Closed |
|---------|----------|----------|--------|
| Q4 FY24 | 3.8× | 24% | $11.2M |
| Q1 FY25 | 3.5× | 22% | $10.8M |
| Q2 FY25 | 4.1× | 25% | $12.3M |
| Q3 FY25 | 3.2× | 21% | $10.1M |

**Trend**: Coverage declining, need pipeline investment
```
