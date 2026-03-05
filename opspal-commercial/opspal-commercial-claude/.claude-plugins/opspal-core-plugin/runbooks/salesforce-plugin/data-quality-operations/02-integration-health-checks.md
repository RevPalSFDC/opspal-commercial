# 02 - Integration Health Checks

## Purpose

Monitor data completeness and accuracy for records created by external integrations (Gong, HubSpot, Marketo, etc.) to identify integration issues before they impact analytics.

## Integration Health Scorecard

### Scoring Methodology

| Metric | Weight | Calculation |
|--------|--------|-------------|
| Field Completeness | 40% | % of expected fields populated |
| Data Freshness | 20% | Records synced within expected window |
| Duplicate Rate | 20% | % of records that are duplicates |
| Error Rate | 20% | % of sync errors in logs |

**Health Score = (Completeness × 0.4) + (Freshness × 0.2) + (1 - DuplicateRate) × 0.2 + (1 - ErrorRate) × 0.2**

### Expected Field Population by Integration

#### Gong Integration

| Object | Field | Expected Rate | Common Issue |
|--------|-------|---------------|--------------|
| Task | CallType | 65%+ | API doesn't always populate |
| Task | WhoId | 80%+ | Contact matching fails |
| Task | AccountId | 75%+ | Account association indirect |
| Task | DurationInMinutes | 95%+ | Usually reliable |
| Task | Description | 90%+ | Transcript summary |

#### HubSpot Integration

| Object | Field | Expected Rate | Common Issue |
|--------|-------|---------------|--------------|
| Lead | LeadSource | 99%+ | Should always be 'HubSpot' |
| Lead | hs_analytics_source | 95%+ | Marketing attribution |
| Contact | Email | 99%+ | Required for sync |
| Contact | hs_lead_status | 85%+ | Lifecycle stage mapping |

## Health Check Implementation

### Daily Health Check Script

```javascript
// scripts/lib/integration-health-checker.js
const INTEGRATION_CONFIGS = {
  gong: {
    identifier: { field: 'CreatedById', pattern: 'Gong%' },
    objects: ['Task'],
    requiredFields: {
      Task: ['CallType', 'WhoId', 'AccountId', 'DurationInMinutes']
    },
    freshnessWindow: 24 // hours
  },
  hubspot: {
    identifier: { field: 'LeadSource', value: 'HubSpot' },
    objects: ['Lead', 'Contact'],
    requiredFields: {
      Lead: ['Email', 'Company', 'LeadSource'],
      Contact: ['Email', 'AccountId']
    },
    freshnessWindow: 4 // hours
  }
};

async function checkIntegrationHealth(integrationName) {
  const config = INTEGRATION_CONFIGS[integrationName];
  const results = {
    integration: integrationName,
    timestamp: new Date().toISOString(),
    objects: {}
  };

  for (const objectName of config.objects) {
    const fields = config.requiredFields[objectName];
    const fieldList = fields.join(', ');

    // Check field population
    const populationQuery = `
      SELECT COUNT(Id) Total, ${fields.map(f => `COUNT(${f}) ${f}_Count`).join(', ')}
      FROM ${objectName}
      WHERE ${config.identifier.field} LIKE '${config.identifier.pattern || config.identifier.value}'
      AND CreatedDate = LAST_N_DAYS:7
    `;

    const populationResult = await executeSOQL(populationQuery);

    // Calculate completeness
    const completeness = fields.reduce((sum, field) => {
      return sum + (populationResult[`${field}_Count`] / populationResult.Total);
    }, 0) / fields.length * 100;

    results.objects[objectName] = {
      recordCount: populationResult.Total,
      completeness: completeness.toFixed(1),
      fieldBreakdown: fields.map(f => ({
        field: f,
        populated: populationResult[`${f}_Count`],
        rate: ((populationResult[`${f}_Count`] / populationResult.Total) * 100).toFixed(1)
      }))
    };
  }

  // Calculate overall health score
  const objectScores = Object.values(results.objects).map(o => parseFloat(o.completeness));
  results.overallHealth = (objectScores.reduce((a, b) => a + b, 0) / objectScores.length).toFixed(1);
  results.status = results.overallHealth >= 80 ? 'HEALTHY'
                 : results.overallHealth >= 60 ? 'DEGRADED'
                 : 'CRITICAL';

  return results;
}
```

### Sample Output

```json
{
  "integration": "gong",
  "timestamp": "2025-12-21T10:30:00Z",
  "overallHealth": "72.5",
  "status": "DEGRADED",
  "objects": {
    "Task": {
      "recordCount": 1250,
      "completeness": "72.5",
      "fieldBreakdown": [
        { "field": "CallType", "populated": 812, "rate": "65.0" },
        { "field": "WhoId", "populated": 1000, "rate": "80.0" },
        { "field": "AccountId", "populated": 937, "rate": "75.0" },
        { "field": "DurationInMinutes", "populated": 1187, "rate": "95.0" }
      ]
    }
  }
}
```

## Anomaly Detection

### Baseline Establishment

Run for 2-4 weeks to establish baselines before enabling anomaly alerts:

```javascript
async function establishBaseline(integrationName, daysBack = 28) {
  const dailyResults = [];

  for (let day = 0; day < daysBack; day++) {
    const result = await checkIntegrationHealth(integrationName, {
      dateRange: `LAST_N_DAYS:${day + 1} AND CreatedDate > LAST_N_DAYS:${day}`
    });
    dailyResults.push(result);
  }

  return {
    integration: integrationName,
    baseline: {
      averageHealth: average(dailyResults.map(r => r.overallHealth)),
      stdDeviation: stdDev(dailyResults.map(r => r.overallHealth)),
      minHealth: Math.min(...dailyResults.map(r => r.overallHealth)),
      maxHealth: Math.max(...dailyResults.map(r => r.overallHealth))
    }
  };
}
```

### Alert Thresholds

| Condition | Alert Level | Action |
|-----------|-------------|--------|
| Health > baseline - 1σ | Normal | No action |
| Health < baseline - 1σ | Warning | Investigate within 24h |
| Health < baseline - 2σ | Critical | Investigate immediately |
| Zero records synced | Emergency | Contact integration owner |

## Troubleshooting Procedures

### Gong Sync Issues

```
1. Check Gong admin console for sync errors
2. Verify API connection in Setup > Named Credentials
3. Review Gong-created user permissions
4. Check for Contact matching issues (email mismatch)
5. Review Task trigger conflicts
```

### HubSpot Sync Issues

```
1. Check HubSpot Sync Health in App Settings
2. Review HubSpot integration user permissions
3. Check field mapping configuration
4. Verify required fields aren't blocked by validation rules
5. Review sync error logs in HubSpot
```

## Dashboard Requirements

### Integration Health Dashboard

Components:
1. **Health Score Gauge** - Current health score per integration
2. **Trend Line** - 30-day health trend
3. **Field Breakdown Table** - Population rates by field
4. **Sync Volume Chart** - Records synced per day
5. **Error Log Summary** - Recent sync errors

## Success Criteria

- [ ] All major integrations (Gong, HubSpot) monitored daily
- [ ] Baselines established for each integration
- [ ] Alerts configured for >1σ deviation
- [ ] Health dashboard accessible to data team
- [ ] Response procedures documented and tested
