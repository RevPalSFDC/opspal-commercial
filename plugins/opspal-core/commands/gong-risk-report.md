---
name: gong-risk-report
description: Analyze open deals for conversation-based risk signals from Gong data
argument-hint: "[--pipeline <name>] [--min-amount <n>] [--output <path>]"
---

# Gong Risk Report Command

Score open deals for conversation-based risk signals using Gong call data. Identifies going-dark opportunities, single-threaded deals, competitor mentions, and engagement gaps.

## Usage

```
/gong-risk-report [options]
```

## Options

- `--pipeline <name>` - Filter by pipeline name
- `--min-amount <n>` - Minimum deal amount (default: 0)
- `--output <path>` - Write report to file (JSON)
- `--org <alias>` - Salesforce org alias

## Examples

```bash
# Analyze all open deals
/gong-risk-report

# Enterprise pipeline, deals > $50K
/gong-risk-report --pipeline Enterprise --min-amount 50000

# Export to file
/gong-risk-report --output ./reports/deal-risk-signals.json
```

## Risk Signals Detected

| Signal | Threshold | Impact |
|--------|-----------|--------|
| Going Dark | No calls in 21+ days | HIGH (+25) |
| Engagement Gap | No calls in 14+ days | MEDIUM (+15) |
| Competitor Mentioned | Any competitor tracker | MEDIUM (+20) |
| Budget Concerns | Pricing/budget trackers | MEDIUM (+15) |
| Single-threaded | <2 stakeholders on high-value deal | MEDIUM (+15) |
| Talk Ratio Anomaly | >60% or <30% rep talk time | LOW (+10) |

## Risk Levels

- **HIGH** (score >= 50): Immediate action required
- **MEDIUM** (score 25-49): Monitor closely, plan intervention
- **LOW** (score < 25): Healthy conversation engagement

## Implementation

Delegates to `gong-deal-intelligence-agent` which uses `mcp__gong__run_risk_analysis`.

## Related

- `/gong-sync` - Sync call data to CRM
- `/gong-competitive-intel` - Competitor intelligence
- `/gong-auth` - Validate credentials
