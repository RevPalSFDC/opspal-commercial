# Market Analysis Framework

## Analysis Components

### 1. Market Sizing

```yaml
Total Addressable Market (TAM):
  - Define market boundaries
  - Identify all potential customers
  - Calculate total revenue potential

Serviceable Addressable Market (SAM):
  - Geographic constraints
  - Segment limitations
  - Channel reach

Serviceable Obtainable Market (SOM):
  - Current capacity
  - Competitive position
  - Realistic near-term target
```

### 2. Competitive Analysis

| Factor | Our Position | Competitor A | Competitor B |
|--------|-------------|--------------|--------------|
| Market share | X% | Y% | Z% |
| Product strength | Score | Score | Score |
| Price position | Premium/Par/Discount | | |
| Sales coverage | Territories | | |
| Win rate vs | - | X% | Y% |

### 3. Growth Driver Analysis

```yaml
Organic Growth:
  - Same-store growth rate
  - Price increases
  - Usage expansion

Inorganic Growth:
  - New customer acquisition
  - New segment entry
  - M&A contribution

Risk Factors:
  - Churn rate
  - Competitive pressure
  - Economic conditions
```

## Segmentation Framework

### Segment Definitions

| Segment | Definition | Characteristics |
|---------|------------|-----------------|
| Enterprise | 1000+ employees | Long sales cycle, high ACV |
| Mid-Market | 100-999 employees | Balanced cycle, medium ACV |
| SMB | 20-99 employees | Short cycle, lower ACV |
| Startup | <20, funded | High growth, variable |

### Segment Analysis Template

```markdown
## Segment: [Name]

### Size & Opportunity
- TAM: $XXM
- SAM: $XXM
- Current penetration: X%

### Performance (LTM)
- Revenue: $XXM
- Win rate: X%
- Average deal size: $XXK
- Sales cycle: XX days
- Customer count: XXX

### Growth Plan
- Target growth: X%
- Pipeline needed: $XXM
- Coverage required: X.X×
```

## Historical Performance Analysis

### Cohort Analysis

```sql
-- Rep cohort performance by tenure
SELECT
  CASE
    WHEN months_tenure < 6 THEN 'Ramping'
    WHEN months_tenure < 12 THEN 'Developing'
    WHEN months_tenure < 24 THEN 'Productive'
    ELSE 'Veteran'
  END AS cohort,
  COUNT(DISTINCT rep_id) AS rep_count,
  AVG(quota_attainment) AS avg_attainment,
  SUM(bookings) AS total_bookings
FROM rep_performance
WHERE fiscal_year = YEAR(CURRENT_DATE) - 1
GROUP BY cohort;
```

### Win Rate Analysis

```sql
-- Win rate by segment and source
SELECT
  segment,
  lead_source,
  COUNT(*) AS opportunities,
  SUM(CASE WHEN is_won THEN 1 ELSE 0 END) AS wins,
  ROUND(SUM(CASE WHEN is_won THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS win_rate
FROM opportunities
WHERE close_date >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
GROUP BY segment, lead_source
ORDER BY segment, win_rate DESC;
```

## Forecasting Methodology

### Top-Down Approach

```yaml
Starting Point: Board Target ($XXM)

Decomposition:
  1. By Segment:
     - Enterprise: X% ($XXM)
     - Mid-Market: X% ($XXM)
     - SMB: X% ($XXM)

  2. By Quarter:
     - Q1: X% (seasonality factor)
     - Q2: X%
     - Q3: X%
     - Q4: X%

  3. By Source:
     - New Logo: X%
     - Expansion: X%
     - Renewal: X%
```

### Bottom-Up Approach

```yaml
Capacity Calculation:
  1. Starting headcount × productivity = Base capacity
  2. + New hire capacity (ramp-adjusted)
  3. - Attrition impact
  4. = Total capacity

  Validate: Capacity should be 0.9-1.1× target
```

### Gap Analysis

```markdown
## Target vs Capacity Gap

| Metric | Target | Capacity | Gap |
|--------|--------|----------|-----|
| Annual Revenue | $50M | $48M | -$2M |
| Enterprise | $30M | $28M | -$2M |
| Mid-Market | $15M | $14M | -$1M |
| SMB | $5M | $6M | +$1M |

### Gap Closure Options
1. Add 2 Enterprise AEs (+$2M capacity)
2. Increase productivity 5% (+$2.4M)
3. Reduce attrition to 10% (+$0.5M)
```

## Data Quality Requirements

### Minimum Data for Analysis

| Data Type | Minimum History | Quality Threshold |
|-----------|-----------------|-------------------|
| Opportunity | 24 months | 95% complete |
| Account | 24 months | 90% complete |
| Contact | 12 months | 85% complete |
| Activity | 12 months | 80% complete |

### Validation Checks

- [ ] No null close dates on closed opportunities
- [ ] Amount populated on all opportunities
- [ ] Stage progression makes sense
- [ ] Owner assigned on all records
- [ ] Segment/Region properly classified
