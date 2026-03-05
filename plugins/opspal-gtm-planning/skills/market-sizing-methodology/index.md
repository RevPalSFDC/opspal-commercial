---
name: market-sizing-methodology
description: |
  TAM/SAM/SOM market sizing methodology and penetration analysis.
  Use when calculating market opportunity, analyzing segment penetration,
  or evaluating ICP performance and win profiles.

  TRIGGER KEYWORDS: "tam", "sam", "som", "market size", "penetration",
  "icp", "win profile", "segment analysis"
---

# Market Sizing Methodology

This skill provides methodology for calculating Total Addressable Market (TAM), Serviceable Addressable Market (SAM), and Serviceable Obtainable Market (SOM).

## Market Definitions

### TAM (Total Addressable Market)
The maximum potential market demand if you achieved 100% market share across all possible customers.

```
TAM = Total Potential Customers × Average Annual Revenue per Customer
```

### SAM (Serviceable Addressable Market)
The portion of TAM that fits your ideal customer profile, geography, and product scope.

```
SAM = TAM × ICP Filter Percentage
```

Common SAM filters:
- Geographic availability
- Industry focus
- Company size thresholds
- Use case applicability

### SOM (Serviceable Obtainable Market)
The realistic near-term market share considering competition and capacity.

```
SOM = SAM × Realistic Market Share Percentage
```

## Calculation Methods

### Top-Down Approach
Start with industry-wide data and filter down:

1. **Industry TAM** - Use analyst reports (Gartner, Forrester, IDC)
2. **Apply Filters** - Narrow by geography, segment, use case
3. **Adjust for Competition** - Factor in competitor market share

**Pros**: Fast, uses established research
**Cons**: May not reflect actual opportunity accurately

### Bottom-Up Approach
Build from individual customer opportunities:

1. **Count Potential Customers** - Database of addressable companies
2. **Estimate Average Deal Size** - Based on similar customer wins
3. **Multiply and Sum** - Aggregate to market totals

**Pros**: Grounded in real customer data
**Cons**: Time-intensive, may miss unknown segments

### Hybrid Approach (Recommended)
Use both methods and reconcile:

1. Calculate top-down TAM from research
2. Calculate bottom-up TAM from customer data
3. Compare and investigate discrepancies
4. Use bottom-up for SAM (more accurate filters)
5. Use realistic assumptions for SOM

## Segment-Level Analysis

### Segmentation Dimensions

| Dimension | Example Values |
|-----------|----------------|
| Company Size | Enterprise, Mid-Market, SMB |
| Industry | Technology, Healthcare, Finance |
| Geography | NA, EMEA, APAC, LATAM |
| Use Case | RevOps, Sales Automation, CS |

### Segment Opportunity Matrix

| Segment | TAM | SAM | Current ARR | Penetration |
|---------|-----|-----|-------------|-------------|
| Enterprise | $30B | $8B | $15M | 0.19% |
| Mid-Market | $15B | $3B | $7M | 0.23% |
| SMB | $5B | $1B | $3M | 0.30% |

### Prioritization Framework

Score segments on:
1. **Size** - Absolute dollar opportunity
2. **Growth** - Segment growth rate
3. **Fit** - Alignment with product capabilities
4. **Accessibility** - Ability to reach and sell

## Penetration Analysis

### Penetration Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| TAM Penetration | Current ARR / TAM | Total market share |
| SAM Penetration | Current ARR / SAM | Target market share |
| SOM Attainment | Current ARR / SOM | Progress to realistic goal |

### Penetration Benchmarks by Stage

| Stage | TAM Penetration | SAM Penetration |
|-------|-----------------|-----------------|
| Early Stage | <1% | <5% |
| Growth Stage | 1-5% | 5-20% |
| Mature | 5-15% | 20-50% |

### Headroom Analysis
```
SAM Headroom = SAM - Current ARR
             = $12B - $25M
             = $11.975B remaining opportunity
```

## ICP Win Profile Analysis

### ICP (Ideal Customer Profile)
Define characteristics of customers most likely to:
1. Buy (high win rate)
2. Stay (low churn)
3. Expand (high NRR)

### Win Rate Analysis

```
ICP Win Rate = ICP Deals Won / Total ICP Deals
Non-ICP Win Rate = Non-ICP Deals Won / Total Non-ICP Deals
Win Rate Lift = ICP Win Rate / Non-ICP Win Rate
```

### Win Rate Lift Thresholds

| Lift | Assessment | Action |
|------|------------|--------|
| ≥1.5x | Significant | Double down on ICP targeting |
| 1.2-1.5x | Marginal | Refine ICP criteria |
| <1.2x | Not significant | Re-evaluate ICP definition |

### Win Profile Attributes

Analyze win rates by:
- **Industry** - Which verticals win more?
- **Company Size** - Optimal employee count range?
- **Champion Title** - Which buyers close deals?
- **Use Case** - Which problems resonate?
- **Competitor** - Who do we beat/lose to?

## Data Sources

### External Research
- Gartner Magic Quadrant reports
- Forrester Wave evaluations
- IDC market sizing studies
- Industry analyst briefings

### Internal Data
- CRM account and opportunity data
- Customer success metrics
- Historical win/loss analysis
- Usage and adoption data

### Third-Party Data
- LinkedIn Sales Navigator (company counts)
- ZoomInfo/Clearbit (firmographic data)
- G2/TrustRadius (competitive intel)

## Best Practices

1. **Document Assumptions** - Every TAM/SAM/SOM needs explicit assumptions
2. **Validate Annually** - Markets change; refresh sizing yearly
3. **Use Multiple Methods** - Cross-check top-down vs bottom-up
4. **Be Conservative** - Better to under-promise than over-project
5. **Segment Deeply** - Aggregate numbers hide actionable insights
6. **Link to Strategy** - Market sizing should inform GTM decisions
