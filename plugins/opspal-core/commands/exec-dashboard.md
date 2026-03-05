---
name: exec-dashboard
description: Generate unified executive dashboards combining metrics from all platforms
argument-hint: "[--template <name>] [--period <period>] [--format web|pdf|json]"
arguments:
  - name: period
    description: Reporting period (this_quarter, last_quarter, this_year)
    required: false
  - name: template
    description: Dashboard template (executive_summary, board_report, sales_leadership)
    required: false
  - name: format
    description: Output format (web, pdf, json)
    required: false
---

# Executive Dashboard Command

Generate unified executive dashboards combining revenue, pipeline, marketing, and customer success metrics from all connected platforms.

## Usage

```bash
/exec-dashboard                             # Executive summary
/exec-dashboard --template board_report     # Board-ready report
/exec-dashboard --period this_year --format pdf
/exec-dashboard --template sales_leadership
```

## What This Does

1. **Data Aggregation**: Collects metrics from Salesforce, HubSpot, Marketo
2. **KPI Calculation**: Computes executive-level KPIs (ARR, NRR, CAC, etc.)
3. **Trend Analysis**: Identifies trends and generates commentary
4. **Alert Generation**: Highlights metrics needing attention
5. **Outlook Projection**: Forecasts with risks and opportunities

## Execution

Use the unified-exec-dashboard-agent:

```javascript
Task({
  subagent_type: 'opspal-core:unified-exec-dashboard-agent',
  prompt: `Generate executive dashboard. Period: ${period || 'this_quarter'}. Template: ${template || 'executive_summary'}. Format: ${format || 'web'}`
});
```

## Output

The dashboard includes:
- **Hero Metrics**: Top-level KPIs with trends and vs. target
- **Revenue Section**: ARR waterfall, trends, breakdown
- **Pipeline Section**: Coverage, stage health, conversion
- **Marketing Section**: MQLs, attribution, campaign performance
- **Customer Success**: Retention, NPS, health distribution
- **Alerts**: Issues requiring attention
- **Outlook**: Forecast with risks and opportunities

## Related Commands

- `/forecast` - Detailed revenue forecasting
- `/pipeline-health` - Pipeline deep-dive
- `/cs-ops` - Customer success details
