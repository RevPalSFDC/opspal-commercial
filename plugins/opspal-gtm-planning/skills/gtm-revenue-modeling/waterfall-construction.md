# ARR Waterfall Construction Guide

Detailed methodology for building ARR (Annual Recurring Revenue) waterfall analyses.

## Waterfall Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARR Waterfall Components                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Beginning ARR                                                   │
│  ──────────────────────────                                      │
│       ↓                                                          │
│  + New Business ARR (New logos)                                  │
│       ↓                                                          │
│  + Expansion ARR (Upsell + Cross-sell)                           │
│       ↓                                                          │
│  - Contraction ARR (Downgrades)                                  │
│       ↓                                                          │
│  - Churn ARR (Lost customers)                                    │
│       ↓                                                          │
│  ═══════════════════════════                                     │
│  Ending ARR                                                      │
│                                                                  │
│  ───────────────────────────────────────                         │
│  Net New ARR = New + Expansion - Contraction - Churn             │
│  Growth Rate = Net New ARR / Beginning ARR                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Definitions

### Beginning ARR

**Definition**: Total ARR at the start of the period from existing active customers.

**Calculation**:
```sql
SELECT SUM(AnnualContractValue__c) as BeginningARR
FROM Contract
WHERE Status = 'Activated'
AND StartDate < [Period Start]
AND EndDate >= [Period Start]
```

**Data Quality Checks**:
- All contracts have valid start/end dates
- No duplicate contracts for same customer
- Currency normalization applied
- Multi-year contracts amortized correctly

### New Business ARR

**Definition**: ARR from net-new customer logos acquired during the period.

**Criteria**:
- First purchase from customer
- Account had no prior ARR
- Closed during the period

**Calculation**:
```sql
SELECT SUM(
  CASE
    WHEN Contract_Months__c > 0
    THEN Amount * 12 / Contract_Months__c
    ELSE Amount
  END
) as NewBusinessARR
FROM Opportunity
WHERE Type = 'New Business'
AND IsWon = true
AND CloseDate >= [Period Start]
AND CloseDate < [Period End]
AND Account.First_Close_Date__c = CloseDate
```

### Expansion ARR

**Definition**: Additional ARR from existing customers (upsells and cross-sells).

**Components**:
| Type | Definition |
|------|------------|
| Upsell | More of same product/tier upgrade |
| Cross-sell | Additional product lines |
| Price increase | Same scope, higher price |

**Calculation**:
```sql
SELECT SUM(
  CASE
    WHEN Contract_Months__c > 0
    THEN Amount * 12 / Contract_Months__c
    ELSE Amount
  END
) as ExpansionARR
FROM Opportunity
WHERE Type IN ('Expansion', 'Upsell', 'Cross-Sell')
AND IsWon = true
AND CloseDate >= [Period Start]
AND CloseDate < [Period End]
AND Account.Existing_Customer__c = true
```

### Contraction ARR

**Definition**: Reduction in ARR from existing customers who downgraded.

**Causes**:
- Tier/seat reduction
- Product removal
- Price decrease negotiated
- Partial churn

**Calculation**:
```sql
SELECT SUM(ARR_Decrease__c) as ContractionARR
FROM Contract_Modification__c
WHERE Type = 'Downgrade'
AND Effective_Date__c >= [Period Start]
AND Effective_Date__c < [Period End]
AND Account.Status__c = 'Active'
```

### Churn ARR

**Definition**: ARR lost from customers who fully cancelled.

**Types**:
| Type | Definition |
|------|------------|
| Voluntary | Customer chose to leave |
| Involuntary | Non-payment, breach |
| Competitive | Left for competitor |

**Calculation**:
```sql
SELECT SUM(Lost_ARR__c) as ChurnARR
FROM Account
WHERE Churn_Date__c >= [Period Start]
AND Churn_Date__c < [Period End]
AND Status__c = 'Churned'
```

---

## Data Source Mapping

### Salesforce Objects

| Component | Primary Source | Backup Source |
|-----------|---------------|---------------|
| Beginning ARR | Contract | Opportunity (Renewal) |
| New Business | Opportunity (New) | Contract |
| Expansion | Opportunity (Expansion) | Contract Modification |
| Contraction | Contract Modification | Opportunity (Downgrade) |
| Churn | Account (Churned) | Contract (Expired) |

### Custom Fields Needed

```yaml
Account:
  - First_Close_Date__c (Date)
  - Existing_Customer__c (Formula/Checkbox)
  - Current_ARR__c (Currency/Rollup)
  - Churn_Date__c (Date)
  - Churn_Reason__c (Picklist)

Opportunity:
  - ARR__c (Currency/Formula)
  - Contract_Months__c (Number)
  - Prior_ARR__c (Currency)
  - ARR_Change__c (Formula)

Contract:
  - AnnualContractValue__c (Currency)
  - Prior_Contract_Value__c (Currency)

Contract_Modification__c (Custom Object):
  - Type (Picklist: Upgrade, Downgrade)
  - ARR_Change__c (Currency)
  - Effective_Date__c (Date)
```

---

## Time Period Handling

### Monthly Waterfall

```javascript
function calculateMonthlyWaterfall(month, year) {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0);  // Last day of month

  return {
    period: `${year}-${String(month).padStart(2, '0')}`,
    beginningARR: getBeginningARR(periodStart),
    newBusiness: getNewBusinessARR(periodStart, periodEnd),
    expansion: getExpansionARR(periodStart, periodEnd),
    contraction: getContractionARR(periodStart, periodEnd),
    churn: getChurnARR(periodStart, periodEnd)
  };
}
```

### Quarterly Waterfall

```javascript
function calculateQuarterlyWaterfall(quarter, year) {
  const quarters = {
    Q1: { start: 0, end: 2 },
    Q2: { start: 3, end: 5 },
    Q3: { start: 6, end: 8 },
    Q4: { start: 9, end: 11 }
  };

  const periodStart = new Date(year, quarters[quarter].start, 1);
  const periodEnd = new Date(year, quarters[quarter].end + 1, 0);

  return calculateWaterfall(periodStart, periodEnd);
}
```

### Annual Waterfall

```javascript
function calculateAnnualWaterfall(year) {
  const periodStart = new Date(year, 0, 1);  // Jan 1
  const periodEnd = new Date(year, 11, 31);  // Dec 31

  return calculateWaterfall(periodStart, periodEnd);
}
```

---

## Validation Rules

### Beginning = Prior Ending

```javascript
function validateContinuity(periods) {
  for (let i = 1; i < periods.length; i++) {
    const priorEnding = periods[i - 1].endingARR;
    const currentBeginning = periods[i].beginningARR;

    if (Math.abs(priorEnding - currentBeginning) > 0.01) {
      throw new Error(
        `Discontinuity: ${periods[i - 1].period} ending (${priorEnding}) ` +
        `!= ${periods[i].period} beginning (${currentBeginning})`
      );
    }
  }
}
```

### Component Sanity Checks

```javascript
function validateComponents(waterfall) {
  const issues = [];

  // New business should be positive
  if (waterfall.newBusiness < 0) {
    issues.push('New Business ARR is negative');
  }

  // Expansion should be positive
  if (waterfall.expansion < 0) {
    issues.push('Expansion ARR is negative');
  }

  // Contraction should be positive (represents decrease)
  if (waterfall.contraction < 0) {
    issues.push('Contraction should be positive value');
  }

  // Churn should be positive
  if (waterfall.churn < 0) {
    issues.push('Churn ARR should be positive value');
  }

  // Ending should match calculation
  const calculatedEnding = waterfall.beginningARR +
    waterfall.newBusiness +
    waterfall.expansion -
    waterfall.contraction -
    waterfall.churn;

  if (Math.abs(calculatedEnding - waterfall.endingARR) > 0.01) {
    issues.push('Ending ARR does not match component sum');
  }

  return issues;
}
```

---

## Output Format

### Executive Summary

```
ARR Waterfall: FY2025
═══════════════════════════════════════════════════
Beginning ARR (Jan 1):           $10,000,000
─────────────────────────────────────────────────
+ New Business:                  + $4,000,000
+ Expansion:                     + $1,500,000
- Contraction:                   -   $500,000
- Churn:                         - $1,000,000
─────────────────────────────────────────────────
= Ending ARR (Dec 31):           $14,000,000
═══════════════════════════════════════════════════

Net New ARR:                     + $4,000,000
Net Growth Rate:                      40.0%
Net Revenue Retention (NRR):         110.0%
Gross Revenue Retention (GRR):        95.0%
```

### Detailed Breakdown

```
Component Analysis:
─────────────────────────────────────────────────
                    ARR        % of        % of
                               Beginning   Net New
─────────────────────────────────────────────────
New Business    $4,000,000      40.0%      100.0%
Expansion       $1,500,000      15.0%       37.5%
Contraction    ($500,000)      (5.0%)     (12.5%)
Churn        ($1,000,000)     (10.0%)     (25.0%)
─────────────────────────────────────────────────
Net New ARR     $4,000,000      40.0%
─────────────────────────────────────────────────
```

### Trend Analysis

```
Monthly Waterfall Trend:
─────────────────────────────────────────────────────────────────────
Month   Begin      New      Expand   Contract  Churn    End      Net%
─────────────────────────────────────────────────────────────────────
Jan     $10.0M    $300K    $100K    ($40K)    ($80K)   $10.3M   2.8%
Feb     $10.3M    $320K    $120K    ($35K)    ($75K)   $10.6M   3.2%
Mar     $10.6M    $350K    $140K    ($50K)    ($90K)   $11.0M   3.3%
...
Dec     $13.5M    $400K    $180K    ($60K)    ($100K)  $14.0M   3.1%
─────────────────────────────────────────────────────────────────────
```

---

## Common Issues

### Double Counting

**Problem**: Same ARR counted in multiple components.

**Solution**: Clear delineation rules:
- New Business: Only first-ever purchase
- Expansion: Only incremental ARR
- Use contract effective dates, not booking dates

### Multi-Year Contracts

**Problem**: Booking vs. ARR timing mismatch.

**Solution**: Amortize multi-year deals:
```javascript
function calculateARR(amount, contractMonths) {
  return (amount / contractMonths) * 12;
}
```

### Currency Conversion

**Problem**: Multi-currency deals skew totals.

**Solution**: Normalize to single currency:
```javascript
function normalizeToUSD(amount, currency, asOfDate) {
  const rate = getExchangeRate(currency, 'USD', asOfDate);
  return amount * rate;
}
```

### Timing of Recognition

| Event | When to Count |
|-------|---------------|
| New deal closed | Contract start date |
| Expansion signed | Amendment effective date |
| Churn notice | Contract end date |
| Contraction | Amendment effective date |

---

## Best Practices

### Data Governance

- Document all definitions
- Single source of truth for ARR
- Regular data quality audits
- Change log for modifications

### Reporting Cadence

- Weekly: High-level metrics
- Monthly: Full waterfall
- Quarterly: Trend analysis
- Annual: Strategic review

### Stakeholder Alignment

- Finance: GAAP-aligned definitions
- Sales: Bookings vs. ARR clarity
- Success: Retention metrics focus
- Executive: Growth story narrative
