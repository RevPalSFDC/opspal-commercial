# Analysis Methodology

## 6-Phase Diagnostic Workflow

### Phase 1: Data Collection (15-20%)
**Duration**: 30-60 minutes

```javascript
const dataCollectionChecklist = {
  sources: [
    'CRM opportunity data (6+ months)',
    'Marketing automation metrics',
    'Sales activity logs',
    'Lead source attribution',
    'Win/loss analysis data'
  ],
  metrics: [
    'Lead volume by source',
    'Stage conversion rates',
    'Sales cycle length',
    'Win/loss reasons',
    'Rep performance data'
  ],
  timeframes: {
    primary: '6 months',
    comparison: 'Previous 6 months',
    trend: '12-24 months'
  }
};
```

### Phase 2: Stage Analysis (20-25%)
**Duration**: 45-90 minutes

```javascript
function analyzeStageConversions(data) {
  const stages = [
    { name: 'Lead', count: data.leads },
    { name: 'MQL', count: data.mqls },
    { name: 'SQL', count: data.sqls },
    { name: 'Opportunity', count: data.opportunities },
    { name: 'Closed Won', count: data.closedWon }
  ];

  return stages.map((stage, index) => {
    if (index === 0) return { ...stage, conversionRate: null };

    const previousStage = stages[index - 1];
    const conversionRate = (stage.count / previousStage.count) * 100;

    return {
      ...stage,
      conversionRate,
      drop: previousStage.count - stage.count,
      dropRate: ((previousStage.count - stage.count) / previousStage.count) * 100
    };
  });
}
```

### Phase 3: Benchmark Comparison (15-20%)
**Duration**: 30-45 minutes

```javascript
function compareToenchmarks(metrics, industry = 'b2b_saas') {
  const benchmarks = getBenchmarks(industry);

  return Object.keys(metrics).map(metric => {
    const value = metrics[metric];
    const benchmark = benchmarks[metric];

    const performance = calculatePerformance(value, benchmark);

    return {
      metric,
      actual: value,
      benchmark: benchmark.median,
      percentile: performance.percentile,
      rating: performance.rating,
      gap: value - benchmark.median
    };
  });
}

function calculatePerformance(value, benchmark) {
  if (value >= benchmark.top25) return { percentile: 75, rating: 'excellent' };
  if (value >= benchmark.median) return { percentile: 50, rating: 'good' };
  if (value >= benchmark.bottom25) return { percentile: 25, rating: 'fair' };
  return { percentile: 10, rating: 'needs_improvement' };
}
```

### Phase 4: Bottleneck Identification (15-20%)
**Duration**: 30-45 minutes

```javascript
function identifyBottlenecks(stageAnalysis, benchmarks) {
  const bottlenecks = [];

  for (const stage of stageAnalysis) {
    if (!stage.conversionRate) continue;

    const benchmark = benchmarks[stage.name];
    const gap = stage.conversionRate - benchmark.median;

    if (gap < -10) {
      bottlenecks.push({
        stage: stage.name,
        severity: 'critical',
        conversionRate: stage.conversionRate,
        benchmark: benchmark.median,
        gap: gap,
        volumeImpact: calculateVolumeImpact(stage, benchmark)
      });
    } else if (gap < -5) {
      bottlenecks.push({
        stage: stage.name,
        severity: 'warning',
        conversionRate: stage.conversionRate,
        benchmark: benchmark.median,
        gap: gap,
        volumeImpact: calculateVolumeImpact(stage, benchmark)
      });
    }
  }

  return bottlenecks.sort((a, b) => a.gap - b.gap);
}
```

### Phase 5: Root Cause Analysis (15-20%)
**Duration**: 45-60 minutes

```javascript
const rootCauseDecisionTree = {
  'low_lead_volume': {
    questions: [
      'Is traffic sufficient?',
      'Are conversion rates on forms acceptable?',
      'Is lead quality consistent?'
    ],
    causes: {
      'low_traffic': ['SEO issues', 'Low ad spend', 'Poor content strategy'],
      'low_form_conversion': ['Form friction', 'Poor value prop', 'Trust issues'],
      'quality_issues': ['Targeting misalignment', 'Messaging mismatch']
    }
  },
  'low_mql_rate': {
    questions: [
      'Are leads matching ICP?',
      'Is scoring model accurate?',
      'Are qualification criteria appropriate?'
    ],
    causes: {
      'poor_fit': ['Lead source quality', 'Targeting too broad'],
      'scoring_issues': ['Outdated model', 'Wrong criteria weights'],
      'criteria_issues': ['Too strict', 'Too loose', 'Misaligned with sales']
    }
  },
  'low_sql_rate': {
    questions: [
      'Are SDRs following process?',
      'Is discovery call effective?',
      'Are MQLs actually ready?'
    ],
    causes: {
      'process_issues': ['Script problems', 'Training gaps'],
      'discovery_issues': ['Poor questions', 'Time constraints'],
      'timing_issues': ['Handoff too early', 'No nurture path']
    }
  },
  'low_win_rate': {
    questions: [
      'Are we losing on price?',
      'Are we losing to competitors?',
      'Are we losing to no decision?'
    ],
    causes: {
      'price_issues': ['Value not established', 'Wrong segment'],
      'competitive_issues': ['Feature gaps', 'Positioning weak'],
      'no_decision': ['Champion left', 'Budget cut', 'Priority change']
    }
  }
};
```

### Phase 6: Recommendation Generation (10-15%)
**Duration**: 30-45 minutes

```javascript
function generateRecommendations(bottlenecks, rootCauses) {
  const recommendations = [];

  for (const bottleneck of bottlenecks) {
    const causes = rootCauses[bottleneck.stage];

    for (const cause of causes) {
      const solution = getSolutionForCause(cause);
      recommendations.push({
        bottleneck: bottleneck.stage,
        rootCause: cause,
        solution: solution.action,
        impact: solution.expectedImpact,
        effort: solution.effort,
        priority: calculatePriority(solution.expectedImpact, solution.effort)
      });
    }
  }

  return recommendations.sort((a, b) => b.priority - a.priority);
}
```

## Segmentation Analysis

### By Lead Source
```javascript
function analyzeByLeadSource(data) {
  const sources = groupBy(data, 'leadSource');

  return Object.keys(sources).map(source => ({
    source,
    volume: sources[source].length,
    conversionRate: calculateConversion(sources[source]),
    avgDealSize: calculateAvgDealSize(sources[source]),
    salesCycle: calculateAvgCycle(sources[source]),
    roi: calculateSourceROI(sources[source])
  }));
}
```

### By Rep Performance
```javascript
function analyzeByRep(data) {
  const reps = groupBy(data, 'ownerId');

  return Object.keys(reps).map(repId => ({
    rep: repId,
    pipeline: calculatePipeline(reps[repId]),
    winRate: calculateWinRate(reps[repId]),
    avgDealSize: calculateAvgDealSize(reps[repId]),
    velocity: calculateVelocity(reps[repId]),
    activityLevel: calculateActivity(reps[repId])
  }));
}
```

### By Deal Size
```javascript
function analyzeByDealSize(data, tiers) {
  const segments = {
    small: data.filter(d => d.amount < tiers.small),
    medium: data.filter(d => d.amount >= tiers.small && d.amount < tiers.medium),
    large: data.filter(d => d.amount >= tiers.medium && d.amount < tiers.large),
    enterprise: data.filter(d => d.amount >= tiers.large)
  };

  return Object.keys(segments).map(tier => ({
    tier,
    volume: segments[tier].length,
    winRate: calculateWinRate(segments[tier]),
    salesCycle: calculateAvgCycle(segments[tier]),
    conversionPath: analyzeConversionPath(segments[tier])
  }));
}
```
