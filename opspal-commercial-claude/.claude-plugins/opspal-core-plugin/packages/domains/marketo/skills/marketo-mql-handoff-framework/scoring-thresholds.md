# Scoring Threshold Design

## MQL Threshold Configuration

### Two-Dimensional Threshold

```
┌─────────────────────────────────────────────────────────────┐
│              MQL QUALIFICATION MATRIX                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Demographic   │  MQL if Behavior >= X                      │
│  Score         │                                             │
│  ─────────────────────────────────────────────────────────  │
│  70+ (A Lead)  │  MQL if Behavior >= 30 (Fast Track)        │
│  50-69 (B)     │  MQL if Behavior >= 50 (Standard)          │
│  30-49 (C)     │  MQL if Behavior >= 70 (High Engagement)   │
│  < 30 (D)      │  Never MQL (Poor Fit)                      │
│                                                              │
│  Visual:                                                     │
│                                                              │
│  Demo    │                                                   │
│  Score   │   D    │    C    │    B    │    A                │
│  ────────┼────────┼─────────┼─────────┼─────────            │
│  100     │   -    │  MQL    │  MQL    │  MQL                │
│  80      │   -    │  MQL    │  MQL    │  MQL ★              │
│  60      │   -    │   -     │  MQL    │  MQL                │
│  40      │   -    │   -     │  MQL    │  MQL                │
│  20      │   -    │   -     │   -     │  MQL                │
│  ────────┴────────┴─────────┴─────────┴─────────            │
│         20      40       50       60       80   Behavior    │
│                                                              │
│  ★ = Hot Lead (Sales Priority Alert)                        │
└─────────────────────────────────────────────────────────────┘
```

### Implementation in Marketo

```yaml
MQL Threshold Campaign:
  Smart List:
    Trigger: Score is Changed

    # Method 1: Separate thresholds
    Filter Group 1 (OR):
      - AND:
        - Demographic Score: >= 70
        - Behavior Score: >= 30

      - AND:
        - Demographic Score: between 50-69
        - Behavior Score: >= 50

      - AND:
        - Demographic Score: between 30-49
        - Behavior Score: >= 70

    # Method 2: Combined with formula
    Alternative: Score >= 90

  Flow:
    1. Change Lead Status: MQL
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

### Threshold Adjustment Framework

```javascript
const thresholdOptimization = {
  // Target metrics
  targets: {
    mql_to_sql_rate: 0.40,      // 40% should become SQL
    sql_to_opp_rate: 0.60,      // 60% should become Opportunity
    sales_acceptance_rate: 0.75, // 75% accepted by sales
    false_positive_rate: 0.15   // Max 15% rejected as unqualified
  },

  // Adjustment triggers
  adjustments: {
    // If SQL rate too low, raise threshold
    too_many_unqualified: {
      indicator: 'mql_to_sql_rate < 0.30',
      action: 'raise behavior threshold by 10'
    },

    // If SQL rate too high, lower threshold
    missing_good_leads: {
      indicator: 'mql_to_sql_rate > 0.60',
      action: 'lower behavior threshold by 10'
    },

    // If sales acceptance low, review criteria
    sales_rejection_high: {
      indicator: 'sales_acceptance_rate < 0.60',
      action: 'audit rejection reasons, adjust criteria'
    }
  },

  // Review cadence
  review_frequency: 'quarterly'
};
```

## Hot Lead Identification

### Hot Lead Criteria

```yaml
Hot Lead Definition:
  # Fast-track high-value leads
  criteria:
    - OR:
      # High fit + engagement
      - AND:
        - Demographic Score: >= 70
        - Behavior Score: >= 70

      # High-intent actions
      - Demo Requested: is true
      - Pricing Page Visit: in last 24 hours
      - Free Trial Started: is true

      # Enterprise signal
      - AND:
        - Number of Employees: >= 1000
        - Behavior Score: >= 50

  actions:
    - Lead Status: Hot Lead
    - Lead Rating: A
    - Alert Type: Immediate
    - SLA: 15 minutes
```

### Hot Lead Alert Campaign

```yaml
Hot Lead Alert Campaign:
  Type: Trigger Campaign

  Smart List:
    Trigger: Fills Out Form (Demo Request)
    Trigger: Visits Web Page (Pricing)
    Filter: Demographic Score >= 50

  Flow:
    1. Change Data Value: Lead Status = Hot Lead
    2. Change Data Value: Alert Type = Hot
    3. Sync Lead to SFDC (immediate)
    4. Send Alert: Hot Lead Alert
    5. Create Task in SFDC:
       - Subject: "HOT LEAD - Call within 15 min"
       - Due: Now + 15 minutes
       - Priority: High
```

## Scoring Decay Integration

### Decay Rules with Threshold Impact

```yaml
Score Decay Impact:
  # When scores decay, leads may drop below MQL
  scenario: Lead was MQL, now decayed below threshold

  handling:
    - Check: Current Score < MQL Threshold
    - AND: Lead Status = MQL
    - AND: Not yet SQL or Opportunity

  actions:
    - Change Lead Status: Recycled
    - Remove from Sales Queue
    - Return to Nurture Program
    - Log: MQL Decayed
```

### Re-qualification Path

```yaml
Re-qualification Rules:
  # Allow recycled leads to re-qualify
  criteria:
    - Lead Status: Recycled
    - Days Since Recycled: >= 30
    - New Score: >= MQL Threshold

  actions:
    - Change Lead Status: MQL (Re-qualified)
    - Sync to SFDC
    - Send Alert: Re-qualified Lead
    - Log: MQL Re-qualification
```
