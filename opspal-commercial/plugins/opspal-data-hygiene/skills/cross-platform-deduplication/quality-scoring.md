# Data Quality Scoring

## Company Quality Score

### Scoring Components

| Component | Weight | Criteria |
|-----------|--------|----------|
| Data Completeness | 30% | Required fields populated |
| Relationship Density | 25% | Contacts, deals, activities |
| Integration Health | 20% | SF sync status |
| Data Freshness | 15% | Recent updates/activity |
| Ownership | 10% | Owner assigned |

### Scoring Formula

```javascript
const calculateQualityScore = (company) => {
  let score = 0;

  // Data Completeness (30 points)
  const requiredFields = ['name', 'domain', 'phone', 'industry'];
  const completeness = requiredFields.filter(f => company[f]).length / requiredFields.length;
  score += completeness * 30;

  // Relationship Density (25 points)
  const contacts = Math.min(company.contacts / 50, 1);  // Cap at 50
  const deals = Math.min(company.deals / 10, 1);        // Cap at 10
  const activities = Math.min(company.activities / 100, 1); // Cap at 100
  score += ((contacts + deals + activities) / 3) * 25;

  // Integration Health (20 points)
  if (company.salesforceaccountid) {
    score += 15;
    if (company.lastSyncDays < 7) score += 5;
  }

  // Data Freshness (15 points)
  if (company.lastActivityDays < 30) score += 15;
  else if (company.lastActivityDays < 90) score += 10;
  else if (company.lastActivityDays < 365) score += 5;

  // Ownership (10 points)
  if (company.owner) score += 10;

  return Math.round(score);
};
```

## Quality Tiers

### Tier Definitions

| Tier | Score Range | Action |
|------|-------------|--------|
| A (High) | 80-100 | Protect, enrich minimally |
| B (Good) | 60-79 | Standard processing |
| C (Fair) | 40-59 | Enrich before merge |
| D (Poor) | 0-39 | May be merge target |

### Tier Distribution

```markdown
## Quality Tier Distribution

| Tier | Count | % | Avg Contacts |
|------|-------|---|--------------|
| A | 234 | 12% | 45 |
| B | 567 | 29% | 18 |
| C | 789 | 41% | 7 |
| D | 345 | 18% | 2 |

**Recommendation**: Focus dedup on C/D tier companies
```

## Duplicate Quality Analysis

### Bundle Quality Report

```json
{
  "bundleId": "A-001",
  "companies": [
    {
      "id": 123,
      "name": "Acme Corp",
      "qualityScore": 82,
      "tier": "A",
      "isCanonical": true
    },
    {
      "id": 456,
      "name": "Acme Corporation",
      "qualityScore": 34,
      "tier": "D",
      "isCanonical": false
    }
  ],
  "analysis": {
    "scoreDifference": 48,
    "clearWinner": true,
    "dataToMerge": ["3 contacts", "1 deal"]
  }
}
```

### Quality-Informed Canonical Selection

```yaml
Selection Rules:
  1. If one company is Tier A and others are C/D:
     → Clear winner, auto-select

  2. If multiple companies are same tier:
     → Use standard scoring algorithm

  3. If lower-tier has more data:
     → Flag for review (may need enrichment first)
```

## Pre-Merge Quality Checks

### Validation Rules

```yaml
Before Merge:
  - [ ] Canonical score > duplicate score (or explained)
  - [ ] No critical data loss flagged
  - [ ] Association counts verified
  - [ ] SF sync status healthy (if applicable)

Quality Gate:
  PASS: Proceed with merge
  WARN: Proceed with caution, log
  FAIL: Require manual review
```

### Data Loss Prevention

```javascript
const checkDataLoss = (canonical, duplicate) => {
  const warnings = [];

  // Check if duplicate has unique valuable data
  if (duplicate.contacts > canonical.contacts * 2) {
    warnings.push('Duplicate has 2x more contacts');
  }

  if (duplicate.deals > 0 && canonical.deals === 0) {
    warnings.push('Duplicate has deals, canonical has none');
  }

  if (duplicate.activities > canonical.activities * 3) {
    warnings.push('Duplicate has 3x more activity history');
  }

  return {
    safe: warnings.length === 0,
    warnings,
    recommendation: warnings.length > 0 ? 'REVIEW' : 'PROCEED'
  };
};
```

## Post-Merge Quality Validation

### Success Metrics

```yaml
Success Criteria:
  - Canonical quality score unchanged or improved
  - Association count = sum of merged companies
  - No orphaned contacts/deals
  - SF sync active (if applicable)
  - ≥95% PRIMARY association coverage
```

### Validation Report

```markdown
## Post-Merge Validation

### Bundle A-001
| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Contacts | 23 | 23 | ✅ |
| Deals | 3 | 3 | ✅ |
| Activities | 156 | 158 | ✅ |
| Quality Score | 82 | 85 | ✅ |

### Association Repair
| Type | Total | Verified | Repaired |
|------|-------|----------|----------|
| PRIMARY | 23 | 11 | 12 |
| Success Rate | - | - | 100% |
```

## Continuous Quality Monitoring

### Post-Dedup Monitoring

```yaml
Weekly Checks:
  - New duplicate detection
  - Quality score changes
  - Orphaned records
  - Sync errors

Monthly Review:
  - Quality tier distribution
  - Duplicate recurrence rate
  - Guardrail effectiveness
```

### Quality Dashboard Queries

```sql
-- Quality tier distribution
SELECT
  CASE
    WHEN quality_score >= 80 THEN 'A'
    WHEN quality_score >= 60 THEN 'B'
    WHEN quality_score >= 40 THEN 'C'
    ELSE 'D'
  END AS tier,
  COUNT(*) AS company_count,
  AVG(contact_count) AS avg_contacts
FROM companies
GROUP BY tier
ORDER BY tier;
```
