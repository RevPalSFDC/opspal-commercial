# Continuous Intelligence Loop Patterns

Patterns for scheduling, monitoring, and integrating feedback into the observability layer.

## Scheduling Patterns

### Daily Export Schedule (Recommended)
```json
{
  "schedule": "daily",
  "exports": [
    {
      "type": "leads",
      "time": "02:00 UTC",
      "lookback": "1 day",
      "fields": ["core", "scoring"]
    },
    {
      "type": "activities",
      "time": "03:00 UTC",
      "lookback": "1 day",
      "activityTypes": ["email", "form"]
    },
    {
      "type": "programMembers",
      "time": "04:00 UTC",
      "programs": "active"
    }
  ],
  "analysis": {
    "trigger": "after_exports",
    "time": "05:00 UTC",
    "types": ["performance", "anomaly"]
  }
}
```

### Hourly Quick Check
```json
{
  "schedule": "hourly",
  "exports": [
    {
      "type": "activities",
      "lookback": "1 hour",
      "activityTypes": ["email"],
      "lightweightMode": true
    }
  ],
  "analysis": {
    "trigger": "threshold",
    "thresholds": {
      "bounceRate": "> 5%",
      "unsubscribeRate": "> 1%"
    }
  }
}
```

### Weekly Deep Analysis
```json
{
  "schedule": "weekly",
  "day": "Monday",
  "time": "06:00 UTC",
  "exports": [
    {
      "type": "leads",
      "lookback": "7 days",
      "fields": ["all"]
    },
    {
      "type": "activities",
      "lookback": "7 days",
      "activityTypes": ["all"]
    }
  ],
  "analysis": {
    "types": ["performance", "engagement", "funnel", "anomaly"],
    "includeHistoricalComparison": true
  }
}
```

## Feedback Loop Integration

### Implementation Tracking
```json
{
  "implementation": {
    "id": "{{recId}}",
    "type": "token_update",
    "implementedAt": "2025-01-15T10:00:00Z",
    "target": {
      "programId": 1044,
      "tokenName": "my.Subject_Line"
    },
    "oldValue": "Your Weekly Update",
    "newValue": "{{lead.firstName}}, your weekly insights"
  },
  "measurement": {
    "baselinePeriod": {
      "start": "2025-01-08T00:00:00Z",
      "end": "2025-01-14T23:59:59Z"
    },
    "comparisonPeriod": {
      "start": "2025-01-15T00:00:00Z",
      "end": "2025-01-21T23:59:59Z"
    },
    "metrics": {
      "openRate": {
        "baseline": 23.5,
        "current": 27.2,
        "change": "+3.7%",
        "targetMet": true
      }
    }
  },
  "status": "success"
}
```

### Impact Measurement Windows
```json
{
  "windows": {
    "quick": {
      "duration": "2 days",
      "purpose": "Early indicator of major issues",
      "minimumSample": 500,
      "rollbackThreshold": "-20%"
    },
    "standard": {
      "duration": "7 days",
      "purpose": "Primary success measurement",
      "minimumSample": 2000,
      "successThreshold": "+5%"
    },
    "extended": {
      "duration": "30 days",
      "purpose": "Long-term impact assessment",
      "minimumSample": 10000,
      "trendAnalysis": true
    }
  }
}
```

### Success/Failure Classification
```javascript
function classifyOutcome(baseline, current, target) {
  const change = ((current - baseline) / baseline) * 100;

  if (change >= target) {
    return {
      status: 'success',
      message: `Target met: ${change.toFixed(1)}% improvement`,
      confidence: change >= target * 1.5 ? 'high' : 'medium'
    };
  } else if (change > 0) {
    return {
      status: 'partial',
      message: `Positive but below target: ${change.toFixed(1)}%`,
      recommendation: 'Monitor for another week'
    };
  } else if (change > -10) {
    return {
      status: 'neutral',
      message: `No significant change: ${change.toFixed(1)}%`,
      recommendation: 'Review recommendation parameters'
    };
  } else {
    return {
      status: 'failure',
      message: `Negative impact: ${change.toFixed(1)}%`,
      recommendation: 'Consider rollback'
    };
  }
}
```

## Learning System

### Pattern Recognition
```json
{
  "learning": {
    "recommendationType": "token_update",
    "patterns": {
      "highSuccess": [
        {
          "pattern": "subject_line_personalization",
          "avgLift": "+4.2%",
          "sampleSize": 45,
          "confidence": "high"
        },
        {
          "pattern": "urgency_language",
          "avgLift": "+2.8%",
          "sampleSize": 23,
          "confidence": "medium"
        }
      ],
      "lowSuccess": [
        {
          "pattern": "emoji_in_subject",
          "avgLift": "-1.2%",
          "sampleSize": 12,
          "note": "B2B audience preference"
        }
      ]
    }
  }
}
```

### Confidence Adjustment
```javascript
function adjustConfidence(recType, pattern, historicalResults) {
  const successes = historicalResults.filter(r => r.status === 'success');
  const successRate = successes.length / historicalResults.length;

  if (historicalResults.length < 5) {
    return 'low';  // Insufficient data
  } else if (successRate >= 0.8 && historicalResults.length >= 10) {
    return 'high';
  } else if (successRate >= 0.6) {
    return 'medium';
  } else {
    return 'low';
  }
}
```

### Feedback Storage
```json
{
  "feedbackLoop": {
    "cycleNumber": 142,
    "lastCycle": "2025-01-15T05:30:00Z",
    "totalImplementations": 285,
    "outcomes": {
      "success": 198,
      "partial": 52,
      "neutral": 25,
      "failure": 10
    },
    "successRate": 69.5,
    "topPerformers": [
      { "type": "token_update", "rate": 82 },
      { "type": "wait_adjustment", "rate": 71 },
      { "type": "ab_test", "rate": 65 }
    ],
    "learningUpdated": "2025-01-14T06:00:00Z"
  }
}
```

## Monitoring & Alerting

### Alert Thresholds
```json
{
  "alerts": {
    "critical": {
      "bounceRate": "> 10%",
      "unsubscribeRate": "> 2%",
      "quotaUsage": "> 95%",
      "exportFailures": ">= 3 consecutive"
    },
    "warning": {
      "bounceRate": "> 5%",
      "unsubscribeRate": "> 1%",
      "quotaUsage": "> 80%",
      "dataAge": "> 24 hours",
      "metricDeviation": "> 1.5 std dev"
    },
    "info": {
      "newProgram": "detected",
      "implementationComplete": true,
      "weeklyReportReady": true
    }
  }
}
```

### Alert Template
```json
{
  "alert": {
    "severity": "warning",
    "timestamp": "2025-01-15T10:30:00Z",
    "type": "metric_deviation",
    "metric": "openRate",
    "details": {
      "current": 15,
      "baseline": 25,
      "deviation": "2.0 std dev below",
      "affectedSegment": "Segment B"
    },
    "suggestedAction": "Review list hygiene and spam scores",
    "relatedRecommendation": "rec-123"
  }
}
```

## Health Monitoring

### System Health Check
```json
{
  "healthCheck": {
    "timestamp": "2025-01-15T06:00:00Z",
    "components": {
      "scheduler": {
        "status": "healthy",
        "lastRun": "2025-01-15T05:00:00Z",
        "nextRun": "2025-01-16T02:00:00Z"
      },
      "exports": {
        "status": "healthy",
        "quota": { "used": 125, "limit": 500, "percent": 25 },
        "lastSuccess": "2025-01-15T04:30:00Z"
      },
      "analysis": {
        "status": "healthy",
        "lastRun": "2025-01-15T05:30:00Z",
        "pendingRecommendations": 3
      },
      "implementation": {
        "status": "healthy",
        "autoImplemented": 2,
        "awaitingApproval": 3
      }
    },
    "overallStatus": "healthy"
  }
}
```

### Data Freshness Check
```javascript
function checkDataFreshness(exports) {
  const now = new Date();
  const results = {};

  for (const [type, info] of Object.entries(exports)) {
    const age = (now - new Date(info.timestamp)) / 3600000; // hours
    results[type] = {
      ageHours: Math.round(age),
      isFresh: age < 24,
      isStale: age >= 24 && age < 48,
      isExpired: age >= 48
    };
  }

  return results;
}
```

## Recovery Patterns

### Failed Export Recovery
```javascript
async function recoverFailedExport(exportType, lastSuccess) {
  // 1. Check current quota
  const quota = await checkQuota();
  if (quota.percentUsed > 90) {
    return { action: 'wait', reason: 'Quota near limit', retryAt: 'midnight' };
  }

  // 2. Calculate gap
  const gap = new Date() - new Date(lastSuccess);
  const gapDays = gap / (24 * 60 * 60 * 1000);

  // 3. Plan recovery
  if (gapDays <= 1) {
    return { action: 'single_export', days: 1 };
  } else if (gapDays <= 31) {
    return { action: 'single_export', days: Math.ceil(gapDays) };
  } else {
    // Need multiple exports
    return {
      action: 'batch_exports',
      batches: Math.ceil(gapDays / 31),
      firstBatch: { startDaysAgo: gapDays, duration: 31 }
    };
  }
}
```

### Rollback Pattern
```javascript
async function rollbackRecommendation(recId) {
  const rec = await getRecommendation(recId);

  if (!rec.rollbackValue) {
    return { success: false, reason: 'No rollback value stored' };
  }

  // 1. Apply rollback
  await applyChange(rec.target, rec.rollbackValue);

  // 2. Log rollback
  await logRollback({
    recommendationId: recId,
    rolledBackAt: new Date().toISOString(),
    reason: rec.rollbackReason,
    originalValue: rec.newValue,
    restoredValue: rec.rollbackValue
  });

  // 3. Update learning
  await updateLearning(rec.type, 'failure', {
    reason: 'Manual rollback',
    context: rec.rollbackReason
  });

  return { success: true };
}
```

## Integration Points

### External Notification
```json
{
  "notifications": {
    "slack": {
      "enabled": true,
      "channel": "#marketing-ops",
      "events": ["critical_alert", "weekly_report", "implementation_complete"]
    },
    "email": {
      "enabled": true,
      "recipients": ["marketing@company.com"],
      "events": ["critical_alert", "approval_needed"]
    }
  }
}
```

### API Integration
```javascript
// Export latest metrics for external systems
async function exportMetricsAPI() {
  const metrics = await getLatestMetrics();

  return {
    timestamp: new Date().toISOString(),
    engagement: {
      openRate: metrics.openRate,
      clickRate: metrics.clickRate,
      bounceRate: metrics.bounceRate
    },
    recommendations: {
      pending: metrics.pendingRecs,
      implemented: metrics.implementedRecs,
      successRate: metrics.successRate
    },
    health: {
      quotaUsage: metrics.quotaUsage,
      dataFreshness: metrics.dataAge
    }
  };
}
```
