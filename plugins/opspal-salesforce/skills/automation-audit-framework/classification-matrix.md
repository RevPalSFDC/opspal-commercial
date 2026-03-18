# Business Process Classification Matrix

## Classification Dimensions

### Stage Classification

| Stage | Objects | Typical Automation |
|-------|---------|-------------------|
| **Top of Funnel** | Lead, Campaign, CampaignMember | Lead scoring, assignment, nurture |
| **Sales Cycle** | Opportunity, Quote, OpportunityLineItem | Stage validation, approvals, pricing |
| **Post-Close** | Contract, Order, Case | Renewal triggers, support routing |
| **Back Office** | Account, Contact, User | Data enrichment, deduplication |

### Department Classification

| Department | Primary Objects | Automation Types |
|------------|-----------------|-----------------|
| **Marketing** | Lead, Campaign | Scoring, routing, attribution |
| **Sales** | Opportunity, Quote | Stage gates, forecasting, approvals |
| **Customer Success** | Account, Case | Health scoring, escalation, renewal |
| **Finance** | Order, Invoice, Contract | Revenue recognition, billing |
| **IT/Ops** | All | Data quality, integration, logging |

## Classification Rules

### Object-Based Classification

```javascript
const classifyByObject = (automation) => {
  const objectMappings = {
    'Lead': { stage: 'Top of Funnel', dept: 'Marketing' },
    'Campaign': { stage: 'Top of Funnel', dept: 'Marketing' },
    'CampaignMember': { stage: 'Top of Funnel', dept: 'Marketing' },
    'Opportunity': { stage: 'Sales Cycle', dept: 'Sales' },
    'Quote': { stage: 'Sales Cycle', dept: 'Sales' },
    'SBQQ__Quote__c': { stage: 'Sales Cycle', dept: 'Sales' },
    'OpportunityLineItem': { stage: 'Sales Cycle', dept: 'Sales' },
    'Contract': { stage: 'Post-Close', dept: 'Finance' },
    'Order': { stage: 'Post-Close', dept: 'Finance' },
    'Case': { stage: 'Post-Close', dept: 'Customer Success' },
    'Account': { stage: 'Back Office', dept: 'IT/Ops' },
    'Contact': { stage: 'Back Office', dept: 'IT/Ops' }
  };

  return objectMappings[automation.object] || {
    stage: 'Unknown',
    dept: 'Unknown'
  };
};
```

### Action-Based Classification

```javascript
const classifyByAction = (automation) => {
  const actions = automation.actions || [];

  // Email actions indicate Marketing
  if (actions.some(a => a.type === 'EMAIL_ALERT')) {
    return { dept: 'Marketing' };
  }

  // Field updates to Amount/Stage indicate Sales
  if (actions.some(a => a.field?.match(/Amount|Stage|Forecast/i))) {
    return { dept: 'Sales' };
  }

  // Case-related actions indicate CS
  if (actions.some(a => a.type === 'CASE_ESCALATION')) {
    return { dept: 'Customer Success' };
  }

  return { dept: 'IT/Ops' }; // Default
};
```

## Priority Matrix

### Remediation Priority by Classification

| Priority | Classification | Rationale |
|----------|---------------|-----------|
| **P0** | Sales Cycle + Active Conflict | Revenue impact |
| **P1** | Post-Close + Customer-Facing | Customer experience |
| **P2** | Top of Funnel + Lead Loss | Pipeline impact |
| **P3** | Back Office + Data Quality | Operational efficiency |
| **P4** | IT/Ops + No Conflict | Technical debt |

### Impact Scoring

```javascript
const calculateImpact = (automation, classification) => {
  const weights = {
    'Sales Cycle': 3,
    'Post-Close': 2,
    'Top of Funnel': 2,
    'Back Office': 1
  };

  const baseScore = weights[classification.stage] || 1;

  // Multiply by execution frequency
  const frequencyMultiplier = automation.executionCount > 1000 ? 1.5 : 1;

  // Multiply by error rate
  const errorMultiplier = automation.errorRate > 0.05 ? 2 : 1;

  return baseScore * frequencyMultiplier * errorMultiplier;
};
```

## Output Format

### Classification Report

```markdown
## Automation Classification Summary

### By Stage
| Stage | Count | % of Total |
|-------|-------|------------|
| Sales Cycle | XX | XX% |
| Top of Funnel | XX | XX% |
| Post-Close | XX | XX% |
| Back Office | XX | XX% |

### By Department
| Department | Count | Conflict Risk |
|------------|-------|---------------|
| Sales | XX | HIGH/MED/LOW |
| Marketing | XX | HIGH/MED/LOW |
| CS | XX | HIGH/MED/LOW |
| Finance | XX | HIGH/MED/LOW |
| IT/Ops | XX | HIGH/MED/LOW |

### Priority Queue
1. [Automation Name] - P0 - [Reason]
2. [Automation Name] - P1 - [Reason]
3. [Automation Name] - P2 - [Reason]
```
