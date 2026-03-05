---
name: data-health
description: Generate quick data quality health scorecard
argument-hint: "[--object Account|Contact|all] [--format markdown|json|csv]"
visibility: user-invocable
aliases:
  - health-check
  - dq-score
tags:
  - data-quality
  - health
  - revops
---

# /data-health Command

Generate a quick data quality health scorecard with grade, dimension scores, and prioritized recommendations. Faster than a full audit - focuses on key health indicators.

## Usage

```bash
# Quick health check on all objects
/data-health

# Check specific object
/data-health --object Account

# Output as JSON for automation
/data-health --format json

# Include trend comparison
/data-health --with-trends
```

## Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--object` | Account, Contact, Lead, all | all | Target object type |
| `--format` | markdown, json, csv | markdown | Output format |
| `--with-trends` | true/false | false | Compare to previous checks |
| `--org` | [org-alias] | default | Salesforce org alias |
| `--input` | [path] | - | JSON input data file (required for CLI) |

## Health Dimensions

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Population | 25% | Field completeness across records |
| Staleness | 25% | Data freshness and decay |
| Anomalies | 20% | Data quality issues detected |
| Compliance | 15% | GDPR/CCPA compliance status |
| Consistency | 15% | Format and pattern consistency |

## Grading Scale

| Grade | Score | Meaning |
|-------|-------|---------|
| A | 90-100 | Excellent data quality |
| B | 80-89 | Good with minor issues |
| C | 70-79 | Fair, needs attention |
| D | 60-69 | Poor, significant issues |
| F | 0-59 | Critical, immediate action needed |

## Output Example

### Markdown Format
```markdown
# Data Health Scorecard

**Organization:** Production Org
**Date:** 2025-01-15T10:30:00Z
**Records Analyzed:** 15,432

## Overall Score: 78/100 (Grade: C)

| Dimension | Score | Status | Trend |
|-----------|-------|--------|-------|
| Population | 82 | ✅ Good | ↑ +3 |
| Staleness | 71 | ⚠️ Fair | ↓ -2 |
| Anomalies | 85 | ✅ Good | → 0 |
| Compliance | 90 | ✅ Good | → 0 |
| Consistency | 62 | ⚠️ Fair | ↑ +5 |

## Bottom Line
Your data quality is **fair** but trending positive. Focus on reducing stale phone data and improving email consistency.

## Top 3 Priorities
1. **Email Consistency** - 15% of emails have inconsistent formats
2. **Phone Staleness** - 23% of phones >12 months old
3. **Industry Population** - 18% of accounts missing industry

## Quick Wins
- Fix 45 duplicate accounts (30 min)
- Standardize 200 phone formats (1 hr)
- Fill 150 missing industries via enrichment (2 hrs)
```

### JSON Format
```json
{
  "summary": {
    "overallScore": 78,
    "grade": "C",
    "recordsAnalyzed": 15432,
    "timestamp": "2025-01-15T10:30:00Z"
  },
  "dimensions": {
    "population": {"score": 82, "status": "good", "trend": 3},
    "staleness": {"score": 71, "status": "fair", "trend": -2},
    "anomalies": {"score": 85, "status": "good", "trend": 0},
    "compliance": {"score": 90, "status": "good", "trend": 0},
    "consistency": {"score": 62, "status": "fair", "trend": 5}
  },
  "bottomLine": "Your data quality is fair but trending positive...",
  "topIssues": [...],
  "quickWins": [...]
}
```

### CSV Format
```csv
dimension,score,status,trend,weight
population,82,good,3,25%
staleness,71,fair,-2,25%
anomalies,85,good,0,20%
compliance,90,good,0,15%
consistency,62,fair,5,15%
```

## Status Indicators

| Status | Icon | Score Range | Action |
|--------|------|-------------|--------|
| Good | ✅ | 80-100 | Maintain |
| Fair | ⚠️ | 60-79 | Improve |
| Poor | ❌ | 0-59 | Critical |

## Trend Indicators

| Trend | Icon | Meaning |
|-------|------|---------|
| Improving | ↑ | Score increased from last check |
| Stable | → | No significant change |
| Declining | ↓ | Score decreased from last check |

## Health vs. Full Audit

| Feature | /data-health | /data-quality-audit |
|---------|--------------|---------------------|
| Speed | Fast (~30 sec) | Thorough (~5 min) |
| Depth | Key indicators | Full analysis |
| Actions | Quick wins only | Complete action list |
| Trends | Yes | No |
| Use Case | Daily check | Weekly/monthly audit |

## Related Commands

- `/data-quality-audit` - Full comprehensive audit
- `/deduplicate` - Run deduplication workflow
- `/enrich-data` - Fill data gaps
- `/review-queue` - Process pending actions

## CLI Usage

```bash
# Run health check via script
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/governance/health-check.js \
  --object Account \
  --format json \
  --input ./reports/account-export.json

# Schedule daily health checks
/schedule-add --name "Daily Health Check" \
  --type claude-prompt \
  --schedule "0 8 * * *" \
  --prompt "/data-health --format json"
```

## Configuration

```bash
# Set default format
export DQ_HEALTH_FORMAT=markdown

# Enable trend tracking
export DQ_HEALTH_TRENDS=1

# Set history retention (days)
export DQ_HEALTH_HISTORY=30
```

## Examples

### Quick morning health check
```bash
/data-health
```

### JSON for dashboard integration
```bash
/data-health --format json --with-trends
```

### Account-specific health
```bash
/data-health --object Account --format markdown
```
