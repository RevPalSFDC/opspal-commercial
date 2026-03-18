# Continuous Intelligence Loop

## Overview

This runbook covers the feedback loop that connects data collection, analysis, implementation, and learning. The goal is a self-improving system where each cycle of recommendations leads to better future recommendations.

## Loop Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONTINUOUS INTELLIGENCE LOOP                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│     ┌─────────────┐                              ┌─────────────┐           │
│     │   COLLECT   │────────────────────────────▶│   ANALYZE   │           │
│     │    Data     │                              │   (Claude)  │           │
│     └─────────────┘                              └──────┬──────┘           │
│           ▲                                             │                   │
│           │                                             ▼                   │
│     ┌─────┴───────┐                              ┌─────────────┐           │
│     │    LEARN    │◀────────────────────────────│  RECOMMEND  │           │
│     │  & Adjust   │                              │             │           │
│     └─────────────┘                              └──────┬──────┘           │
│           ▲                                             │                   │
│           │                                             ▼                   │
│     ┌─────┴───────┐                              ┌─────────────┐           │
│     │   MEASURE   │◀────────────────────────────│  IMPLEMENT  │           │
│     │   Impact    │                              │   Changes   │           │
│     └─────────────┘                              └─────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Loop Stages

### Stage 1: Collect

Automated data collection on schedule.

**Triggers**:
- Scheduled exports (hourly/daily)
- On-demand extraction requests
- Post-campaign triggers

**Output**:
- Normalized lead data
- Activity logs
- Program membership snapshots

### Stage 2: Analyze

Claude interprets collected data.

**Triggers**:
- After successful data collection
- On-demand analysis requests
- Anomaly detection alerts

**Output**:
- Performance summaries
- Trend identification
- Anomaly reports

### Stage 3: Recommend

Generate actionable suggestions.

**Triggers**:
- After analysis completion
- When anomalies detected
- Scheduled recommendation reviews

**Output**:
- Prioritized recommendation queue
- Auto-implement candidates
- Approval requests

### Stage 4: Implement

Execute approved changes.

**Triggers**:
- Auto-implement rules match
- Human approval granted
- Scheduled implementation windows

**Output**:
- Change records
- Rollback points
- Implementation confirmations

### Stage 5: Measure

Track change impact.

**Triggers**:
- 2 days post-implementation (quick check)
- 7 days post-implementation (full assessment)
- 30 days post-implementation (long-term)

**Output**:
- Impact metrics
- Before/after comparisons
- Success/failure classifications

### Stage 6: Learn

Update baselines and preferences.

**Triggers**:
- After impact measurement
- Monthly baseline recalculation
- Quarterly model review

**Output**:
- Updated baselines
- Refined thresholds
- Recommendation weights

## Implementation

### Loop Orchestrator

```javascript
class ContinuousIntelligenceLoop {
  constructor(portal, config) {
    this.portal = portal;
    this.config = config;
    this.basePath = `instances/${portal}/observability`;
    this.state = {
      lastCollection: null,
      lastAnalysis: null,
      pendingMeasurements: [],
      learningQueue: []
    };
  }

  async runCycle() {
    console.log(`Starting intelligence cycle for ${this.portal}`);

    // Stage 1: Collect
    const collectionResult = await this.collect();

    // Stage 2: Analyze (if new data)
    if (collectionResult.newData) {
      const analysisResult = await this.analyze(collectionResult);

      // Stage 3: Recommend
      const recommendations = await this.recommend(analysisResult);

      // Stage 4: Implement auto-implementable
      await this.implementAutoApproved(recommendations);
    }

    // Stage 5: Measure pending implementations
    await this.measurePendingImpacts();

    // Stage 6: Learn from measurements
    await this.learn();

    return this.state;
  }

  async collect() {
    // ... data collection logic
  }

  async analyze(data) {
    // ... Claude analysis logic
  }

  async recommend(analysis) {
    // ... recommendation generation
  }

  async implementAutoApproved(recommendations) {
    // ... auto-implementation logic
  }

  async measurePendingImpacts() {
    // ... impact measurement logic
  }

  async learn() {
    // ... learning and adjustment logic
  }
}
```

### Scheduling the Loop

```javascript
// Schedule configuration
const loopSchedule = {
  // Full cycle: daily at 5 AM UTC
  fullCycle: {
    cron: '0 5 * * *',
    stages: ['collect', 'analyze', 'recommend', 'implement', 'measure', 'learn']
  },

  // Quick check: every 6 hours
  quickCheck: {
    cron: '0 */6 * * *',
    stages: ['measure']
  },

  // Learning update: weekly on Sunday
  weeklyLearning: {
    cron: '0 6 * * 0',
    stages: ['learn']
  }
};

async function scheduleLoop(portal, schedule) {
  const loop = new ContinuousIntelligenceLoop(portal, {});

  // Register scheduled runs
  for (const [name, config] of Object.entries(schedule)) {
    registerCronJob(config.cron, async () => {
      console.log(`Running ${name} cycle for ${portal}`);
      await loop.runCycle(config.stages);
    });
  }
}
```

## Impact Measurement

### Measurement Framework

```javascript
async function measureImplementationImpact(changeId) {
  const change = await getChange(changeId);
  const implementedAt = new Date(change.timestamp);

  // Measurement windows
  const windows = [
    { name: 'quick', days: 2 },
    { name: 'standard', days: 7 },
    { name: 'extended', days: 30 }
  ];

  const measurements = {};

  for (const window of windows) {
    const windowEnd = new Date(implementedAt.getTime() + window.days * 24 * 60 * 60 * 1000);

    // Skip future windows
    if (windowEnd > new Date()) continue;

    // Get before/after metrics
    const beforeMetrics = await getMetricsForPeriod(
      new Date(implementedAt.getTime() - window.days * 24 * 60 * 60 * 1000),
      implementedAt
    );

    const afterMetrics = await getMetricsForPeriod(implementedAt, windowEnd);

    measurements[window.name] = {
      window: `${window.days} days`,
      metrics: compareMetrics(beforeMetrics, afterMetrics),
      statistical: calculateStatisticalSignificance(beforeMetrics, afterMetrics)
    };
  }

  return {
    changeId,
    change: change.description,
    measurements,
    overallAssessment: assessOverallImpact(measurements)
  };
}

function assessOverallImpact(measurements) {
  // Use the longest available measurement window
  const windows = ['extended', 'standard', 'quick'];

  for (const window of windows) {
    if (measurements[window]) {
      const m = measurements[window];

      // Classify impact
      if (m.metrics.primaryMetric.percentChange > 10) {
        return { status: 'positive', confidence: m.statistical.confidence };
      } else if (m.metrics.primaryMetric.percentChange < -10) {
        return { status: 'negative', confidence: m.statistical.confidence };
      } else {
        return { status: 'neutral', confidence: m.statistical.confidence };
      }
    }
  }

  return { status: 'insufficient_data', confidence: 0 };
}
```

### Statistical Significance

```javascript
function calculateStatisticalSignificance(before, after) {
  // Simple z-test for proportions (e.g., open rates)
  const n1 = before.sampleSize;
  const n2 = after.sampleSize;
  const p1 = before.rate;
  const p2 = after.rate;

  const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2));
  const z = (p2 - p1) / se;

  // Convert z-score to confidence level
  const confidence = zScoreToConfidence(Math.abs(z));

  return {
    zScore: z.toFixed(2),
    confidence: confidence.toFixed(1),
    significant: confidence >= 95
  };
}

function zScoreToConfidence(z) {
  // Approximate confidence from z-score
  if (z >= 2.576) return 99;
  if (z >= 1.96) return 95;
  if (z >= 1.645) return 90;
  if (z >= 1.282) return 80;
  return 50 + (z / 1.282) * 30;
}
```

## Learning System

### Baseline Updates

```javascript
async function updateBaselines(portal) {
  const basePath = `instances/${portal}/observability`;
  const baselinesPath = `${basePath}/metrics/baselines.json`;

  // Load current baselines
  const baselines = await loadJSON(baselinesPath) || {};

  // Load recent metrics (90 days)
  const recentMetrics = await loadRecentMetrics(basePath, 90);

  // Calculate new baselines
  const updated = {
    updatedAt: new Date().toISOString(),
    period: '90 days',
    metrics: {
      openRate: calculateBaseline(recentMetrics.map(m => m.openRate)),
      clickRate: calculateBaseline(recentMetrics.map(m => m.clickRate)),
      bounceRate: calculateBaseline(recentMetrics.map(m => m.bounceRate)),
      conversionRate: calculateBaseline(recentMetrics.map(m => m.conversionRate))
    }
  };

  await saveJSON(baselinesPath, updated);
  return updated;
}

function calculateBaseline(values) {
  const sorted = values.filter(v => v != null).sort((a, b) => a - b);
  const n = sorted.length;

  if (n === 0) return null;

  return {
    mean: sorted.reduce((a, b) => a + b, 0) / n,
    median: sorted[Math.floor(n / 2)],
    stdDev: calculateStdDev(sorted),
    p25: sorted[Math.floor(n * 0.25)],
    p75: sorted[Math.floor(n * 0.75)],
    min: sorted[0],
    max: sorted[n - 1]
  };
}
```

### Recommendation Weighting

Learn which types of recommendations tend to succeed:

```javascript
async function updateRecommendationWeights(portal) {
  const history = await loadImplementationHistory(portal);

  // Group by recommendation type
  const byType = {};
  for (const impl of history) {
    const type = impl.type;
    if (!byType[type]) {
      byType[type] = { successes: 0, failures: 0, neutral: 0 };
    }

    const assessment = impl.impact?.overallAssessment?.status;
    if (assessment === 'positive') byType[type].successes++;
    else if (assessment === 'negative') byType[type].failures++;
    else byType[type].neutral++;
  }

  // Calculate success rates and weights
  const weights = {};
  for (const [type, counts] of Object.entries(byType)) {
    const total = counts.successes + counts.failures + counts.neutral;
    const successRate = total > 0 ? counts.successes / total : 0;
    const confidenceBonus = Math.min(total / 20, 1); // More data = more confidence

    weights[type] = {
      successRate: (successRate * 100).toFixed(1),
      sampleSize: total,
      weight: (successRate * confidenceBonus).toFixed(3),
      recommendation: successRate > 0.6 ? 'prefer' :
                      successRate < 0.3 ? 'avoid' : 'neutral'
    };
  }

  await saveJSON(`instances/${portal}/observability/metrics/recommendation-weights.json`, {
    updatedAt: new Date().toISOString(),
    weights
  });

  return weights;
}
```

### Anomaly Threshold Adjustment

Refine anomaly detection based on observed patterns:

```javascript
async function adjustAnomalyThresholds(portal) {
  const baselines = await loadBaselines(portal);
  const falsePositives = await loadFalsePositiveReport(portal);

  const thresholds = {};

  for (const [metric, baseline] of Object.entries(baselines.metrics)) {
    // Start with 2 standard deviations
    let stdDevMultiplier = 2;

    // Adjust based on false positive rate
    const fpRate = falsePositives[metric]?.rate || 0;
    if (fpRate > 0.2) {
      // Too many false positives, widen threshold
      stdDevMultiplier = 2.5;
    } else if (fpRate < 0.05) {
      // Very few false positives, can tighten
      stdDevMultiplier = 1.5;
    }

    thresholds[metric] = {
      lower: baseline.mean - (baseline.stdDev * stdDevMultiplier),
      upper: baseline.mean + (baseline.stdDev * stdDevMultiplier),
      stdDevMultiplier,
      adjustmentReason: fpRate > 0.2 ? 'high_false_positives' :
                        fpRate < 0.05 ? 'low_false_positives' : 'optimal'
    };
  }

  await saveJSON(`instances/${portal}/observability/config/thresholds.json`, {
    updatedAt: new Date().toISOString(),
    thresholds
  });

  return thresholds;
}
```

## Feedback Storage

### Feedback Loop State

```json
{
  "lastUpdated": "2025-01-15T05:30:00Z",
  "cycleCount": 142,
  "lastCycleResult": {
    "collected": true,
    "analyzed": true,
    "recommendationsGenerated": 5,
    "autoImplemented": 2,
    "measurementsCompleted": 8,
    "learningsApplied": true
  },
  "cumulativeStats": {
    "totalRecommendations": 450,
    "totalImplemented": 285,
    "successfulImplementations": 198,
    "avgImpactImprovement": "12.5%",
    "topPerformingType": "token_update",
    "worstPerformingType": "wait_time_change"
  },
  "learningState": {
    "baselinesLastUpdated": "2025-01-14T06:00:00Z",
    "weightsLastUpdated": "2025-01-12T06:00:00Z",
    "thresholdsLastUpdated": "2025-01-08T06:00:00Z"
  }
}
```

## Monitoring & Alerts

### Loop Health Monitoring

```javascript
async function monitorLoopHealth(portal) {
  const state = await loadLoopState(portal);
  const alerts = [];

  // Check cycle freshness
  const hoursSinceLastCycle = (Date.now() - new Date(state.lastUpdated)) / 3600000;
  if (hoursSinceLastCycle > 26) {
    alerts.push({
      severity: 'warning',
      message: `Intelligence loop hasn't run in ${hoursSinceLastCycle.toFixed(0)} hours`
    });
  }

  // Check success rate trend
  const recentRate = state.cumulativeStats.successfulImplementations /
                     state.cumulativeStats.totalImplemented;
  if (recentRate < 0.5) {
    alerts.push({
      severity: 'warning',
      message: `Implementation success rate (${(recentRate*100).toFixed(0)}%) is below threshold`
    });
  }

  // Check for stale learning data
  const learningAge = (Date.now() - new Date(state.learningState.baselinesLastUpdated)) / 86400000;
  if (learningAge > 7) {
    alerts.push({
      severity: 'info',
      message: `Baselines haven't been updated in ${learningAge.toFixed(0)} days`
    });
  }

  return { healthy: alerts.length === 0, alerts };
}
```

## Related

- [01-overview-architecture.md](./01-overview-architecture.md) - System overview
- [05-claude-analysis-patterns.md](./05-claude-analysis-patterns.md) - Analysis stage
- [06-recommendations-actions.md](./06-recommendations-actions.md) - Implementation stage
- [07-storage-retention.md](./07-storage-retention.md) - Data storage
