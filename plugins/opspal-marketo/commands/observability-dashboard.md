---
description: Display current observability metrics, quota status, and recent Claude insights
argument-hint: "[--full] [--json]"
---

# /observability-dashboard

Display the current state of the Marketo observability layer including:

- Last export timestamps and sizes
- API quota usage (daily/rolling)
- Recent Claude recommendations
- Anomaly alerts
- Pending actions

## Dashboard Sections

### 1. Quota Status

```
╔══════════════════════════════════════════════════════════════╗
║  MARKETO BULK EXPORT QUOTA                                    ║
╠══════════════════════════════════════════════════════════════╣
║  Used Today:     125.5 MB / 500 MB (25.1%)                   ║
║  Remaining:      374.5 MB                                     ║
║  Resets in:      8h 23m                                       ║
║  Status:         ✓ Normal                                     ║
╚══════════════════════════════════════════════════════════════╝
```

### 2. Export Status

```
╔══════════════════════════════════════════════════════════════╗
║  RECENT EXPORTS                                               ║
╠══════════════════════════════════════════════════════════════╣
║  Leads:                                                       ║
║    Last Export:    2025-01-15 02:00 UTC (8 hours ago)        ║
║    Records:        45,230                                     ║
║    Size:           12.4 MB                                    ║
║                                                               ║
║  Activities:                                                  ║
║    Last Export:    2025-01-15 03:00 UTC (7 hours ago)        ║
║    Records:        125,890                                    ║
║    Size:           38.2 MB                                    ║
║                                                               ║
║  Program Members:                                             ║
║    Last Export:    2025-01-15 04:00 UTC (6 hours ago)        ║
║    Programs:       12                                         ║
║    Total Records:  8,450                                      ║
╚══════════════════════════════════════════════════════════════╝
```

### 3. Key Metrics

```
╔══════════════════════════════════════════════════════════════╗
║  ENGAGEMENT METRICS (7-day window)                            ║
╠══════════════════════════════════════════════════════════════╣
║  Email Open Rate:     23.5%  (baseline: 25.0%)  ▼ -1.5%      ║
║  Click Rate:           4.2%  (baseline:  4.0%)  ▲ +0.2%      ║
║  Bounce Rate:          1.8%  (baseline:  2.0%)  ▼ -0.2%      ║
║  Unsubscribe Rate:     0.3%  (baseline:  0.4%)  ▼ -0.1%      ║
╚══════════════════════════════════════════════════════════════╝
```

### 4. Anomalies & Alerts

```
╔══════════════════════════════════════════════════════════════╗
║  ALERTS                                                       ║
╠══════════════════════════════════════════════════════════════╣
║  ⚠️  WARNING: Open rate for Segment B is 15% (expected 25%)  ║
║  ℹ️  INFO: New program "Q1 Webinar" has 250 members          ║
╚══════════════════════════════════════════════════════════════╝
```

### 5. Pending Actions

```
╔══════════════════════════════════════════════════════════════╗
║  PENDING ACTIONS                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Recommendations awaiting approval:  3                        ║
║  Implementations being measured:     5                        ║
║  Rollback candidates:                0                        ║
║                                                               ║
║  Run /analyze-performance for latest recommendations         ║
╚══════════════════════════════════════════════════════════════╝
```

### 6. Intelligence Loop Status

```
╔══════════════════════════════════════════════════════════════╗
║  CONTINUOUS INTELLIGENCE LOOP                                 ║
╠══════════════════════════════════════════════════════════════╣
║  Cycle Count:          142                                    ║
║  Last Cycle:           2025-01-15 05:30 UTC                  ║
║  Success Rate:         69.5% (198/285 implementations)       ║
║  Top Performer:        token_update (82% success)            ║
║  Learning Updated:     2025-01-14 06:00 UTC                  ║
╚══════════════════════════════════════════════════════════════╝
```

## Options

### --full

Show expanded details including:
- Complete export history (last 7 days)
- All pending recommendations with details
- Historical comparison charts
- Baseline statistics

### --json

Output in JSON format for programmatic consumption:

```json
{
  "quota": { "usedMB": 125.5, "limitMB": 500, "percentUsed": 25.1 },
  "exports": { ... },
  "metrics": { ... },
  "anomalies": [ ... ],
  "pending": { ... },
  "loop": { ... }
}
```

## Data Sources

This dashboard reads from:
- `observability/metrics/quota-tracking.json`
- `observability/exports/*/` (current files)
- `observability/metrics/aggregations.json`
- `observability/analysis/recommendations/pending.json`
- `observability/history/feedback-loop.json`

## Example Usage

```
# Standard dashboard
/observability-dashboard

# Full details
/observability-dashboard --full

# JSON output
/observability-dashboard --json
```

## Related Commands

- `/observability-setup` - Initial configuration
- `/extract-wizard` - Run manual exports
- `/analyze-performance` - Generate new analysis
