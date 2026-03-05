# MQL Handoff Criteria

## Qualification Requirements

### Score-Based Qualification

```javascript
const mqlQualificationRules = {
  // Option 1: Separate thresholds
  separateScores: {
    behaviorScore: { min: 50, field: 'Behavior Score' },
    demographicScore: { min: 40, field: 'Demographic Score' }
  },

  // Option 2: Combined threshold
  combinedScore: {
    min: 90,
    field: 'Score'
  },

  // Option 3: Weighted approach
  weighted: {
    formula: '(Behavior Score * 0.6) + (Demographic Score * 0.4)',
    threshold: 50
  }
};
```

### Required Field Validation

```yaml
Required Fields:
  email:
    validation: Valid email format
    reason: Primary contact method
    action_if_missing: Block MQL

  firstName:
    validation: Not empty
    reason: Personalization
    action_if_missing: Block MQL

  lastName:
    validation: Not empty
    reason: Personalization
    action_if_missing: Block MQL

  company:
    validation: Not empty
    reason: Account matching in SFDC
    action_if_missing: Block MQL

Recommended Fields:
  phone:
    validation: Valid format
    reason: Sales outreach
    action_if_missing: Flag for enrichment

  jobTitle:
    validation: Not empty
    reason: Qualification
    action_if_missing: Flag for enrichment
```

### Exclusion Criteria

| Exclusion | Check Method | Action |
|-----------|--------------|--------|
| Competitor | Email domain list | Block MQL, mark competitor |
| Existing Customer | SFDC Account lookup | Route to CSM |
| Unsubscribed | Unsubscribed = true | Block MQL |
| Invalid Email | Hard bounced | Block MQL |
| Job Seeker | Careers page visitor | Block MQL |
| Personal Email | Gmail, Yahoo, etc. | Lower score, review |

### Smart List Criteria Example

```yaml
MQL Qualification Smart List:
  triggers:
    - Score is Changed
    - Data Value Changes: Lead Status

  filters:
    - Score: >= 90 (or separate behavior + demographic)
    - Email Address: not empty
    - First Name: not empty
    - Last Name: not empty
    - Company Name: not empty
    - Lead Status: not in [Disqualified, Customer, Competitor]
    - Unsubscribed: is false
    - Email Invalid: is false
```

## Lifecycle Stage Transitions

### Stage Flow
```
New → Engaged → MQL → SAL → SQL → Opportunity → Customer
                  ↓                     ↓
              Recycled ←───────── Closed Lost
```

### Stage Definitions

| Stage | Owner | Entry Criteria | Exit Criteria |
|-------|-------|----------------|---------------|
| New | Marketing | Lead created | First engagement |
| Engaged | Marketing | Any interaction | Meets MQL criteria |
| MQL | Marketing | Score threshold met | Sales accepts |
| SAL | Sales | Sales reviews | Qualified or rejected |
| SQL | Sales | Discovery complete | Opportunity created |
| Opportunity | Sales | Opp exists | Win or lose |
| Customer | Success | Closed Won | - |
| Recycled | Marketing | Sales rejected | Re-qualified |

## Handoff Timing

### Optimal Handoff Windows
```
Business Hours Only:
- Monday-Friday: 8 AM - 5 PM local time
- Queue weekend/after-hours MQLs for Monday 8 AM

Immediate Handoff Triggers:
- Demo request forms
- Pricing page + contact form
- Free trial signup
- Direct sales inquiry

Batch Handoff (Daily):
- Score threshold MQLs
- Content engagement MQLs
- Low-urgency leads
```

### SLA Definitions

| SLA Type | Timeframe | Escalation |
|----------|-----------|------------|
| Hot Lead | 15 minutes | Manager alert at 30 min |
| Standard MQL | 4 hours | Manager alert at 8 hours |
| Batch MQL | 24 hours | Manager alert at 48 hours |
