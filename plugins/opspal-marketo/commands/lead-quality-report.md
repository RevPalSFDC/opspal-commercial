---
description: Generate a comprehensive lead quality report for your Marketo database
argument-hint: "[instance] [--sample=size] [--segment=filter]"
---

# Lead Database Quality Report

Generate a comprehensive lead quality report for your Marketo database.

## Usage

```
/lead-quality-report [instance] [--sample=size] [--segment=filter]
```

## Parameters

- `instance` - (Optional) Instance ID. Uses current if not specified.
- `--sample` - Sample size for analysis (default: 1000, max: 10000)
- `--segment` - Segment filter (e.g., `source=webinar`, `score>=50`)

## What This Command Analyzes

### Data Completeness (30% of score)
- Required fields: email, firstName, lastName
- Important fields: company, phone, title, industry
- Optional fields: address, city, state, country

### Data Freshness (25% of score)
- Recent activity (0-30 days): Full points
- Moderate activity (31-90 days): Partial points
- Stale (91-180 days): Minimal points
- Inactive (180+ days): Zero points

### Data Accuracy (20% of score)
- Email format validation
- Phone format validation
- Invalid/test domain detection
- Placeholder value detection

### Engagement (15% of score)
- Activity volume
- Recent activity recency
- High-value activities (clicks, form fills)

### Scoring Alignment (10% of score)
- Lead score populated
- Score within expected range
- Non-zero engagement score

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LEAD DATABASE QUALITY REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Instance: production-instance
Sample Size: 1,000 leads
Report Date: 2025-12-05

## Overall Quality Score: 72/100 (Good)

### Score Breakdown
| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| Completeness | 85 | 30% | 25.5 |
| Freshness | 58 | 25% | 14.5 |
| Accuracy | 78 | 20% | 15.6 |
| Engagement | 62 | 15% | 9.3 |
| Scoring | 70 | 10% | 7.0 |

### Quality Tier Distribution
| Tier | Count | Percentage |
|------|-------|------------|
| Excellent (80+) | 312 | 31.2% |
| Good (60-79) | 425 | 42.5% |
| Fair (40-59) | 198 | 19.8% |
| Poor (<40) | 65 | 6.5% |

### Key Findings

#### Data Completeness Issues
- 15% missing company name
- 8% missing phone number
- 3% missing first name

#### Freshness Concerns
- 25% inactive for 180+ days (consider cleanup)
- 18% stale (91-180 days)

#### Accuracy Issues
- 2.3% invalid email formats
- 1.5% test/disposable email domains
- 4.2% placeholder values detected

### Top Recommendations

1. **Clean stale leads** - 250 leads inactive 180+ days
   Impact: Improve deliverability, reduce costs

2. **Enrich company data** - 150 leads missing company
   Impact: Better segmentation and scoring

3. **Implement email validation** - Prevent bad data entry
   Impact: Long-term data quality improvement

4. **Review scoring model** - 70 leads have no score
   Impact: Better lead prioritization
```

## Related Agent

This command uses: `marketo-lead-quality-assessor`

## Output Location

```
portals/{instance}/assessments/
├── lead-quality-{date}.json
└── lead-quality-{date}.md
```
