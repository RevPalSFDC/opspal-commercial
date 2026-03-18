# MQL Threshold Design

## Threshold Definition

```yaml
MQL Criteria:
  Behavior Score >= 50
  AND Demographic Score >= 40
  AND Required Fields Complete:
    - Email (valid)
    - First Name
    - Last Name
    - Company
  AND NOT Disqualified:
    - Not Competitor
    - Not Unsubscribed
    - Not Existing Customer
```

## MQL Trigger Campaign

```yaml
MQL Qualification Trigger:
  Smart List:
    Trigger: Score is Changed
      Score Name = Behavior Score
      New Score >= 50
    Filter: Demographic Score >= 40
    Filter: Email Address is not empty
    Filter: First Name is not empty
    Filter: Company is not empty
    Filter: NOT Member of Static List "Competitors"
    Filter: Unsubscribed = False
    Filter: Lead Status is not "Customer"

  Flow:
    1. Change Data Value
       Attribute = Lead Status
       New Value = MQL
    2. Change Data Value
       Attribute = MQL Date
       New Value = {{system.date}}
    3. Interesting Moment
       Type = Milestone
       Description = "Lead qualified as MQL (Score: {{lead.Score}})"
    4. Request Campaign
       Campaign = MQL Handoff Campaign

  Schedule: Activated (runs on trigger)
```

## Threshold Approaches

### Option 1: Separate Thresholds (Recommended)

```javascript
const separateScores = {
  behaviorScore: { min: 50, field: 'Behavior Score' },
  demographicScore: { min: 40, field: 'Demographic Score' }
};
```

**Pros**:
- Clear distinction between fit and engagement
- Prevents low-fit, high-activity leads from becoming MQL
- Easier to diagnose qualification issues

### Option 2: Combined Threshold

```javascript
const combinedScore = {
  min: 90,
  field: 'Score'
};
```

**Pros**:
- Simpler to implement
- Single metric to track

**Cons**:
- Can't distinguish fit vs engagement
- May qualify wrong leads

### Option 3: Weighted Approach

```javascript
const weighted = {
  formula: '(Behavior Score * 0.6) + (Demographic Score * 0.4)',
  threshold: 50
};
```

## Threshold Optimization

### Analysis Queries

```sql
-- MQL to SQL conversion by score range
SELECT
  CASE
    WHEN behavior_score >= 80 THEN '80+'
    WHEN behavior_score >= 60 THEN '60-79'
    WHEN behavior_score >= 40 THEN '40-59'
    ELSE 'Under 40'
  END AS score_range,
  COUNT(*) AS mql_count,
  SUM(CASE WHEN became_sql = 1 THEN 1 ELSE 0 END) AS sql_count,
  ROUND(SUM(CASE WHEN became_sql = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS conversion_rate
FROM leads
WHERE mql_date > DATE_SUB(NOW(), INTERVAL 90 DAY)
GROUP BY score_range
ORDER BY score_range;
```

### Adjustment Framework

```javascript
const thresholdOptimization = {
  // Target metrics
  targets: {
    mql_to_sql_rate: 0.40,       // 40% should become SQL
    sql_to_opp_rate: 0.60,       // 60% should become Opportunity
    sales_acceptance_rate: 0.75, // 75% accepted by sales
    false_positive_rate: 0.15    // Max 15% rejected as unqualified
  },

  // Adjustment triggers
  adjustments: {
    too_many_unqualified: {
      indicator: 'mql_to_sql_rate < 0.30',
      action: 'raise behavior threshold by 10'
    },
    missing_good_leads: {
      indicator: 'mql_to_sql_rate > 0.60',
      action: 'lower behavior threshold by 10'
    },
    sales_rejection_high: {
      indicator: 'sales_acceptance_rate < 0.60',
      action: 'audit rejection reasons, adjust criteria'
    }
  },

  review_frequency: 'quarterly'
};
```

## Score Distribution Validation

Run monthly to check scoring health:

```
SCORE DISTRIBUTION REPORT:
├── 0-20 points: Cold leads (should be ~40%)
├── 21-50 points: Warming leads (should be ~35%)
├── 51-80 points: Hot leads (should be ~20%)
└── 81+ points: MQL ready (should be ~5%)

RED FLAGS:
• Too many leads at 0: Forms not scoring properly
• Spike at specific number: Campaign running multiple times
• No leads above 50: Thresholds too high
• Everyone above 80: Thresholds too low
```

## Hot Lead Identification

Fast-track high-value leads:

```yaml
Hot Lead Criteria:
  OR:
    # High fit + engagement
    - AND:
      - Demographic Score >= 70
      - Behavior Score >= 70

    # High-intent actions
    - Demo Requested: is true
    - Pricing Page Visit: in last 24 hours
    - Free Trial Started: is true

    # Enterprise signal
    - AND:
      - Number of Employees >= 1000
      - Behavior Score >= 50

  Actions:
    - Lead Status: Hot Lead
    - Lead Rating: A
    - Alert Type: Immediate
    - SLA: 15 minutes
```

## Threshold Documentation Template

```markdown
## Scoring Model Documentation

### Model Overview
- Business Objectives
- ICP Definition
- MQL Criteria

### Behavioral Rules
- Email engagement rules
- Web activity rules
- Form submission rules
- Event attendance rules

### Demographic Rules
- Job title matrix
- Industry scoring
- Company size bands
- Geographic preferences

### Negative Scoring
- Disqualification rules
- Decay configuration

### Validation Results
- Distribution analysis
- Conversion correlation
- Model effectiveness
```
