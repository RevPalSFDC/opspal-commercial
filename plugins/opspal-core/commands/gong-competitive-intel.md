---
name: gong-competitive-intel
description: Generate competitive intelligence report from Gong tracker data
argument-hint: "[--period 2026-Q1|90d] [--competitors 'A,B,C'] [--output <path>]"
---

# Gong Competitive Intelligence Command

Analyze Gong tracker data for competitor mentions. Groups by competitor, deal stage, and time period. Generates battlecard-ready insights.

## Usage

```
/gong-competitive-intel [options]
```

## Options

- `--period <p>` - Analysis period: `2026-Q1`, `90d`, `30d` (default: 90d)
- `--competitors <list>` - Comma-separated competitor names to track
- `--output <path>` - Write report to file (JSON or CSV)

## Examples

```bash
# Last 90 days competitive analysis
/gong-competitive-intel

# Quarterly report for specific competitors
/gong-competitive-intel --period 2026-Q1 --competitors "Salesforce,HubSpot,Outreach"

# Export as CSV
/gong-competitive-intel --period 90d --output ./reports/competitive-intel.csv
```

## Report Contents

- **Top Competitors**: Ranked by mention frequency
- **Stage Distribution**: When in the sales cycle competitors come up
- **Trends**: Weekly/monthly mention patterns (increasing, stable, decreasing)
- **Win/Loss Correlation**: Win rate when specific competitors are mentioned
- **Recommendations**: Actionable next steps for sales enablement

## Prerequisites

- Gong trackers configured for competitor detection
- Tracker naming convention: "Competitor - [Name]"
- `GONG_ACCESS_KEY_ID` and `GONG_ACCESS_KEY_SECRET` set

## Implementation

Delegates to `gong-competitive-intelligence-agent` which uses `mcp__gong__competitor_report` and `mcp__gong__trackers_list`.

## Related

- `/gong-risk-report` - Deal risk analysis
- `/gong-sync` - Call data sync
- `/gong-auth` - Validate credentials
