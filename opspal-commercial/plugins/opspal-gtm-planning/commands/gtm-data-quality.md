---
name: gtm-data-quality
description: Assess historical data quality and sufficiency for GTM planning decisions
argument-hint: "[--years <count>] [--objects Opportunity,Account] [--threshold <percent>]"
visibility: user-invocable
aliases:
  - data-quality
  - data-audit
tags:
  - gtm
  - data-quality
  - planning
---

# /gtm-data-quality Command

Assess historical data quality and sufficiency to ensure reliable GTM planning decisions.

## Usage

```bash
# Full data quality assessment
/gtm-data-quality --years 3

# Focus on specific objects
/gtm-data-quality --objects Opportunity,Account,Lead

# Set minimum threshold
/gtm-data-quality --threshold 80%

# Generate remediation plan
/gtm-data-quality --remediate
```

## Assessment Dimensions

| Dimension | Description | Threshold |
|-----------|-------------|-----------|
| Completeness | Required fields populated | ≥85% |
| Accuracy | Values within valid ranges | ≥90% |
| Consistency | Cross-field logic validation | ≥95% |
| Timeliness | Data freshness (days old) | ≤7 days |
| Uniqueness | Duplicate rate | ≤5% |
| History Depth | Years of usable data | ≥2 years |

## Required Data Points

For reliable GTM planning:

```
Opportunity Data (Critical)
├── Close dates (2+ years)
├── Stage progression history
├── Win/loss amounts
├── Sales cycle length
└── Rep attribution

Account Data (Important)
├── Industry classification
├── Employee count / revenue
├── Territory assignment
└── Engagement history

Lead/Contact Data (Supporting)
├── Source attribution
├── Conversion rates
└── Time to conversion
```

## Quality Score

```
Data Quality Score: B (78%)
├── Completeness: 85% ✓
├── Accuracy: 82% ✓
├── Consistency: 71% ⚠️
├── Timeliness: 95% ✓
├── Uniqueness: 88% ✓
└── History: 2.5 years ✓

⚠️ Recommendations:
- Fix stage/close date mismatches (87 records)
- Backfill missing territory assignments (142 accounts)
```

## Output

- `data-quality-report.json` - Full assessment results
- `remediation-plan.md` - Prioritized fixes
- `field-analysis.csv` - Field-by-field breakdown
- `data-gaps.csv` - Records needing attention

## Routing

This command invokes the `gtm-data-insights` agent.

## Example

```bash
# Assess 3 years of opportunity data
/gtm-data-quality --years 3 --objects Opportunity

# Output:
# Data Quality Assessment: Opportunity
# - Records analyzed: 12,847
# - Date range: 2023-01-01 to 2025-12-31
# - Quality score: B (78%)
# - Usable for planning: Yes (with caveats)
# - Remediation items: 229 records
# - Files: data-quality-report.json, remediation-plan.md
```
