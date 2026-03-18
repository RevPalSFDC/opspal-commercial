---
name: gtm-retention
description: Analyze Net Revenue Retention (NRR) and Gross Revenue Retention (GRR) with cohorts
argument-hint: "[--period Q4-2025] [--cohorts true] [--segments enterprise,mid-market,smb]"
---

# Net Dollar Retention Analysis

Analyze NRR/GRR metrics with optional cohort views and segment breakdowns.

## Usage

```
/gtm-retention [options]
```

## Options

- `--period` - Analysis period (default: trailing 12 months)
- `--cohorts` - Include cohort analysis matrix
- `--segments` - Filter or group by segments
- `--trend` - Show trend over multiple periods
- `--logo-retention` - Include logo (customer count) retention

## Key Metrics

### Net Revenue Retention (NRR)
```
NRR = (Starting ARR + Expansion - Churn) / Starting ARR × 100
```
Measures revenue retained including growth from existing customers.

### Gross Revenue Retention (GRR)
```
GRR = (Starting ARR - Churn) / Starting ARR × 100
```
Measures pure retention without expansion (cannot exceed 100%).

## Output

### Summary Metrics
```
Net Revenue Retention:    117%
Gross Revenue Retention:   92%
Expansion ARR:           $2.5M
Churned ARR:             $0.8M
```

### Segment Breakdown
| Segment | NRR | GRR | Expansion | Churn |
|---------|-----|-----|-----------|-------|
| Enterprise | 125% | 95% | $1.8M | $0.3M |
| Mid-Market | 110% | 90% | $0.5M | $0.3M |
| SMB | 95% | 85% | $0.2M | $0.2M |

### Cohort Matrix (Optional)
Shows retention by customer start date across time periods.

## Benchmarks

| Segment | Median NRR | Top Quartile |
|---------|------------|--------------|
| Enterprise | 115% | 130% |
| Mid-Market | 108% | 118% |
| SMB | 95% | 105% |

## Example

```bash
# Basic retention analysis
/gtm-retention

# Full cohort analysis by segment
/gtm-retention --cohorts true --segments enterprise,mid-market,smb

# Trend over 4 quarters
/gtm-retention --trend --period Q1-2025,Q2-2025,Q3-2025,Q4-2025
```

---

This command routes to the `gtm-retention-analyst` agent.
