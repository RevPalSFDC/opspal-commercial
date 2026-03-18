---
name: okr-data-sourcing-protocol
description: Protocol for sourcing OKR metrics from connected platforms. Defines which metrics come from which platform, fallback strategies, DataAccessError patterns, and query evidence requirements. Use when collecting baseline data, troubleshooting data gaps, or validating data quality.
allowed-tools: Read, Grep, Glob
---

# OKR Data Sourcing Protocol

## When to Use This Skill

- Collecting baseline data for KRs from connected platforms
- Troubleshooting data gaps or unavailable platforms
- Validating data quality and evidence coverage
- Understanding which metrics come from which platform
- Implementing fallback strategies when primary sources fail

## Platform → Metric Mapping

### Salesforce (Primary Revenue Source)

| Metric Category | Metrics | SOQL Pattern |
|----------------|---------|--------------|
| Revenue | ARR, MRR, Bookings | `SELECT SUM(Amount) FROM Opportunity WHERE StageName = 'Closed Won'` |
| Pipeline | Coverage, Stage distribution | `SELECT StageName, SUM(Amount) FROM Opportunity WHERE IsClosed = false GROUP BY StageName` |
| Efficiency | Win rate, Sales cycle | `SELECT AVG(DaysToClose__c) FROM Opportunity WHERE IsWon = true` |
| Quota | Attainment, Distribution | `SELECT Owner.Name, SUM(Amount) FROM Opportunity WHERE IsWon = true GROUP BY Owner.Name` |
| Retention | Renewal rate, Churn | Requires custom fields or SBQQ data |

**Required**: Salesforce is the minimum viable platform. Without it, OKR generation should halt.

### HubSpot (Marketing & Sales Engagement)

| Metric Category | Metrics | API Pattern |
|----------------|---------|-------------|
| Acquisition | MQL volume, Lead velocity | Search contacts by lifecycle stage |
| Conversion | MQL-to-SQL rate, Lead-to-opportunity | Search deals by source |
| Engagement | Email open rates, Sequence effectiveness | Analytics API |
| Deal velocity | Time in stage, Deal progression | Deal pipeline analytics |

**Recommended**: Enhances acquisition and marketing KRs significantly.

### Gong (Conversation Intelligence)

| Metric Category | Metrics | Data Pattern |
|----------------|---------|--------------|
| Competitive | Win/loss themes, Competitor mentions | Tracker analysis |
| Deal risk | At-risk deals, Engagement scores | Deal intelligence API |
| Timing | Market signal detection | Competitive tracker trends |

**Nice to have**: Enriches timing sensitivity scoring for initiative prioritization.

### Product Analytics (Pendo/Amplitude/Mixpanel)

| Metric Category | Metrics | Data Pattern |
|----------------|---------|--------------|
| PLG | PQL count, Activation rate | Event-based queries |
| Usage | DAU/MAU, Feature adoption | Session analytics |
| Conversion | Free-to-paid, Trial-to-paid | Funnel analysis |

**Required for PLG/Hybrid**: Essential if GTM model includes product-led motion.

## Query Evidence Requirements

Every metric used as a KR baseline MUST include `query_evidence`:

```json
{
  "baseline": {
    "value": 0.32,
    "measured_at": "2026-03-01T00:00:00Z",
    "source": "salesforce",
    "query_evidence": "SELECT COUNT(Id) won FROM Opportunity WHERE IsWon = true AND CloseDate = LAST_N_DAYS:365"
  }
}
```

### Evidence Quality Levels

| Level | Criteria | Example |
|-------|----------|---------|
| **Full evidence** | Exact query/API call recorded | SOQL query string |
| **Partial evidence** | API endpoint but not exact params | "HubSpot Contacts API, lifecycle_stage filter" |
| **Derived** | Calculated from multiple sources | "ARR derived from Opportunity + SBQQ Subscription" |
| **Manual** | User-provided, no query | Set `query_evidence: null`, flag for review |

## Fallback Strategy

When a primary data source is unavailable:

```
Tier 1: Platform API query (primary)
  ↓ (fails)
Tier 2: Existing agent delegation (secondary)
  ↓ (fails)
Tier 3: Cached snapshot from prior cycle (stale data)
  ↓ (fails)
Tier 4: Industry benchmark as proxy (low confidence)
  ↓ (fails)
Tier 5: Mark as "manual" and flag for user input
```

### Fallback Confidence Degradation

| Tier | Confidence | Flag |
|------|-----------|------|
| 1 | HIGH | None |
| 2 | HIGH | None |
| 3 | MEDIUM | "Baseline from prior snapshot ({date})" |
| 4 | LOW | "Baseline is industry benchmark, not org data" |
| 5 | NONE | "Manual input required" |

## DataAccessError Pattern

When data cannot be retrieved, use the fail-fast pattern:

```javascript
const { DataAccessError } = require('../../opspal-core/scripts/lib/data-access-error');

try {
  const data = await queryPlatform(source, query);
  return {
    value: data.result,
    source: source,
    query_evidence: query,
    confidence: 'HIGH'
  };
} catch (error) {
  // Try fallback tiers
  const fallback = await tryFallbacks(metric_id, source);
  if (fallback) return fallback;

  // If all fallbacks fail, mark for manual input
  return {
    value: null,
    source: 'manual',
    query_evidence: null,
    confidence: 'NONE',
    requires_input: true,
    error: error.message
  };
}
```

## Data Freshness Rules

| Metric Type | Max Staleness | Action If Stale |
|------------|---------------|-----------------|
| Revenue (ARR, MRR) | 7 days | Re-query |
| Pipeline | 3 days | Re-query |
| Retention (NRR/GRR) | 30 days | Acceptable for quarterly KRs |
| Marketing (MQLs) | 7 days | Re-query |
| PLG (activation) | 14 days | Re-query |
| Competitive | 30 days | Acceptable |

## Snapshot Normalization

All platform data is normalized to a canonical format:

```json
{
  "metric_id": "arr_current",
  "category": "revenue",
  "value": 5000000,
  "unit": "$",
  "source": "salesforce",
  "measured_at": "2026-03-09T00:00:00Z",
  "query_evidence": "SELECT SUM(AnnualValue) FROM SBQQ__Subscription__c WHERE SBQQ__Status__c = 'Active'",
  "confidence": "HIGH",
  "benchmark_comparison": {
    "p25": 3000000,
    "p50": 7000000,
    "p75": 15000000,
    "company_stage": "series-b",
    "percentile_position": "p35"
  }
}
```

## Common Data Gaps and Solutions

| Gap | Cause | Solution |
|-----|-------|----------|
| No ARR field | Company uses custom revenue tracking | Query SBQQ Subscriptions or Opportunity with RecordType filter |
| No NRR | No renewal tracking | Derive from cohort analysis (prior year customers, current year revenue) |
| No PQL data | No product analytics integration | Skip PLG KRs, note in snapshot |
| No win rate | Opportunities not consistently closed-lost | Use available data with LOW confidence flag |
| Stale pipeline | Opportunity data not maintained | Flag in data quality section |

## References

- Revenue Snapshot Schema: see `okr-data-aggregator` agent
- KPI Definitions: `../../opspal-core/config/revops-kpi-definitions.json`
- DataAccessError: `../../opspal-core/scripts/lib/data-access-error.js`
