# Territory Design Patterns

## Design Principles

### Fairness
- Equal opportunity across territories
- Gini coefficient ≤0.30
- Variance from mean ≤30%

### Coverage
- 100% account assignment
- No orphaned accounts
- Clear ownership rules

### Efficiency
- Minimize travel/timezone issues
- Group related accounts
- Balance workload

## Territory Balancing Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Potential | 40% | Total addressable revenue |
| Pipeline | 30% | Current pipeline value |
| Install Base | 20% | Existing customer revenue |
| Workload | 10% | Number of accounts |

### Weighting Formula

```javascript
const calculateTerritoryScore = (territory) => {
  return (
    territory.potential * 0.40 +
    territory.pipeline * 0.30 +
    territory.installBase * 0.20 +
    territory.accountCount * 0.10
  );
};
```

## Carving Methodologies

### Geographic

```yaml
Geographic Carving:
  Pros:
    - Clear boundaries
    - Reduced travel
    - Market familiarity

  Cons:
    - Uneven potential
    - May split named accounts

  Best For:
    - Field sales
    - High account density
```

### Industry/Vertical

```yaml
Industry Carving:
  Pros:
    - Domain expertise
    - Relevant references
    - Targeted messaging

  Cons:
    - Geographic spread
    - Cross-industry accounts

  Best For:
    - Complex products
    - Industry-specific solutions
```

### Named Accounts

```yaml
Named Account Carving:
  Pros:
    - Strategic focus
    - Relationship building
    - High-value attention

  Cons:
    - Coverage gaps
    - Scaling challenges

  Best For:
    - Enterprise segment
    - Top 100-500 accounts
```

### Hybrid Model

```yaml
Hybrid Approach:
  Tier 1: Named Accounts
    - Strategic accounts by assignment
    - Account-based reps

  Tier 2: Mid-Market
    - Geographic territories
    - Industry overlay specialists

  Tier 3: SMB
    - Pooled territories
    - Round-robin assignment
```

## Fairness Validation

### Gini Coefficient

```javascript
// Calculate Gini coefficient for territory fairness
const calculateGini = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let sum = 0;

  for (let i = 0; i < n; i++) {
    sum += (2 * (i + 1) - n - 1) * sorted[i];
  }

  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  return sum / (n * n * mean);
};

// Target: Gini ≤ 0.30
// Perfect equality: Gini = 0
// Maximum inequality: Gini = 1
```

### Variance Analysis

```javascript
const calculateVariance = (territories) => {
  const values = territories.map(t => t.potential);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const variance = values.reduce((sum, val) => {
    return sum + Math.pow(val - mean, 2);
  }, 0) / values.length;

  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = (stdDev / mean) * 100;

  return {
    mean,
    stdDev,
    cv: coefficientOfVariation,
    // Target: CV ≤ 30%
  };
};
```

## Rules of Engagement (ROE)

### Ownership Rules

```yaml
Named Account Ownership:
  - Assigned account owner has exclusive rights
  - Valid for full fiscal year
  - Transfer requires VP approval

Whitespace Rules:
  - Geographic owner gets first right
  - 24-hour response SLA
  - Escalation path defined

Conflict Resolution:
  1. First meaningful contact wins
  2. Document in CRM within 24 hours
  3. Manager arbitration if disputed
  4. VP decision is final
```

### Account Movement Rules

```yaml
Account Transfer Rules:
  Triggers:
    - Customer request
    - Rep departure
    - Strategic rebalancing
    - M&A activity

  Process:
    1. Transfer request submitted
    2. Pipeline review (30 days)
    3. VP approval
    4. Effective date (usually quarter start)
    5. Compensation transition

  Pipeline Handling:
    - Opportunities created >30 days before: Original owner
    - Opportunities created <30 days: Split or new owner
    - Closed within transition: Original owner credit
```

## Output Artifacts

### Territory Specification

```markdown
## Territory: [Name]

### Boundaries
- Geographic: [States/Regions]
- Industry: [Verticals]
- Account Size: [Criteria]

### Accounts
- Named Accounts: XX
- Target Accounts: XXX
- Total Universe: XXXX

### Potential
- TAM: $XXM
- Pipeline: $XXM
- Install Base: $XXM

### Assignment
- Primary Owner: [Name]
- Overlay: [Specialist]
- CSM: [Name]
```

### Account Assignment CSV

```csv
account_id,account_name,territory,owner_id,owner_name,segment,potential,pipeline,install_base
001xxx,Acme Corp,West-ENT-1,005xxx,John Smith,Enterprise,500000,250000,100000
001yyy,Beta Inc,East-MM-2,005yyy,Jane Doe,Mid-Market,200000,50000,0
```
