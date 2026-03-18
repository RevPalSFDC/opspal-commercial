# 01 - Field Population Monitoring

## Purpose

Monitor field population rates to detect data quality issues before they impact downstream analytics and reporting.

## Key Metrics

### Critical Thresholds

| Field Category | Acceptable NULL Rate | Warning Threshold | Critical Threshold |
|----------------|---------------------|-------------------|-------------------|
| Required fields | 0% | 1% | 5% |
| Key identifiers | 0-5% | 10% | 20% |
| Integration fields | 5-15% | 25% | 35% |
| Optional fields | 20-50% | 60% | 80% |

### High-Risk Fields to Monitor

| Object | Field | Expected Population | Common Issue |
|--------|-------|---------------------|--------------|
| Task | CallType | 65-85% | Gong integration doesn't populate |
| Task | AccountId | 70-90% | Inbound calls lack association |
| Lead | LeadSource | 90%+ | Import jobs skip field |
| Opportunity | Amount | 95%+ | Early-stage opps left blank |
| Contact | Email | 98%+ | Data entry shortcuts |

## Implementation

### Formula Field Approach

Add a completeness score formula to key objects:

```
IF(ISBLANK(Industry), 0, 1) +
IF(ISBLANK(BillingCity), 0, 1) +
IF(ISBLANK(Phone), 0, 1) +
IF(ISBLANK(Website), 0, 1)
/ 4 * 100
```

### SOQL Monitoring Queries

```sql
-- Field population rate for a specific field
SELECT
  COUNT(Id) TotalRecords,
  COUNT(Industry) PopulatedRecords,
  (COUNT(Industry) * 100.0 / COUNT(Id)) PopulationRate
FROM Account
WHERE CreatedDate = LAST_N_DAYS:30

-- Multi-field population analysis
SELECT
  COUNT(Id) Total,
  COUNT(Industry) Industry_Pop,
  COUNT(BillingCity) BillingCity_Pop,
  COUNT(Phone) Phone_Pop,
  COUNT(Website) Website_Pop
FROM Account
```

### Automated Monitoring Script

```javascript
// scripts/lib/data-quality-monitor.js
async function checkFieldPopulation(objectName, fieldName, options = {}) {
  const { thresholdWarning = 25, thresholdCritical = 35, daysBack = 30 } = options;

  const query = `
    SELECT COUNT(Id) Total, COUNT(${fieldName}) Populated
    FROM ${objectName}
    WHERE CreatedDate = LAST_N_DAYS:${daysBack}
  `;

  const result = await executeSOQL(query);
  const nullRate = ((result.Total - result.Populated) / result.Total) * 100;

  return {
    objectName,
    fieldName,
    totalRecords: result.Total,
    populatedRecords: result.Populated,
    nullRate: nullRate.toFixed(2),
    status: nullRate >= thresholdCritical ? 'CRITICAL'
          : nullRate >= thresholdWarning ? 'WARNING'
          : 'OK'
  };
}
```

## Alerting Rules

### When to Alert

1. **Immediate Alert (Critical)**
   - Required field NULL rate exceeds 5%
   - Integration field NULL rate exceeds 35%
   - Population rate drops >20% from baseline in 24 hours

2. **Daily Digest (Warning)**
   - Any field approaches warning threshold
   - New object/field combinations with poor population

3. **Weekly Report**
   - Trend analysis for all monitored fields
   - Integration source health comparison

### Alert Response Procedures

```
CRITICAL Alert Received:
1. Identify source of NULL values (SOQL analysis by CreatedById, integration source)
2. Check if integration is running (Gong sync status, HubSpot sync health)
3. Review recent deployment changes that may have affected field population
4. If integration issue: Contact integration owner
5. If data entry issue: Create targeted data cleanup task
6. Document in runbook observations for org
```

## Dashboard Components

### Recommended Reports

1. **Field Population Heat Map**
   - Objects as rows, key fields as columns
   - Color-coded by population rate

2. **Population Trend Line**
   - 90-day trend for critical fields
   - Overlay deployment markers

3. **Integration Source Comparison**
   - Population rates by data source
   - Identify which integrations need attention

## Common Pitfalls

### Pitfall 1: Ignoring Integration-Specific Fields

**Problem**: Monitoring overall NULL rate misses that specific integrations (like Gong) have poor field population.

**Solution**: Segment analysis by `CreatedById` or custom integration source field.

```sql
-- Analyze CallType population by source
SELECT
  CreatedBy.Name,
  COUNT(Id) Total,
  COUNT(CallType) Populated
FROM Task
WHERE TaskSubtype = 'Call'
GROUP BY CreatedBy.Name
ORDER BY COUNT(Id) DESC
```

### Pitfall 2: Static Thresholds for All Objects

**Problem**: Using same 20% threshold for all fields ignores business context.

**Solution**: Configure per-object, per-field thresholds based on business requirements.

### Pitfall 3: Not Accounting for Record Types

**Problem**: Some record types intentionally don't populate certain fields.

**Solution**: Add record type to monitoring queries to avoid false positives.

## Success Criteria

- [ ] NULL rate for Gong CallType reduced from 35% to <10%
- [ ] Automated alerts fire within 1 hour of degradation
- [ ] Dashboard query performance <10 seconds
- [ ] 100% of critical fields monitored with appropriate thresholds
