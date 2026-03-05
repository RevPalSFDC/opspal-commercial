---
name: forecast
description: Generate revenue forecasts using weighted pipeline, historical patterns, and time-series analysis
argument-hint: "[period] [--org <alias>] [--method weighted|historical|combined]"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
arguments:
  - name: period
    description: Forecast period (this_quarter, next_quarter, this_year, next_year)
    required: false
  - name: org
    description: Salesforce org alias
    required: false
  - name: method
    description: Forecasting method (weighted, historical, combined)
    required: false
---

# Revenue Forecast Command

Generate comprehensive revenue forecasts combining weighted pipeline analysis, historical patterns, and time-series predictions.

## Usage

```bash
/forecast                                    # Current quarter forecast
/forecast next_quarter                       # Next quarter forecast
/forecast this_year --org production         # Full year with specific org
/forecast next_quarter --method combined     # Using combined methodology
```

## What This Does

1. **Analyzes current pipeline** with weighted probability scoring
2. **Examines historical patterns** (seasonality, win rates, cycle times)
3. **Applies time-series analysis** for trend detection
4. **Calculates variance** against previous forecasts
5. **Generates confidence intervals** (best/expected/worst case)

## Execution

Use the forecast-orchestrator agent:

```javascript
Task({
  subagent_type: 'opspal-gtm-planning:forecast-orchestrator',
  prompt: `Generate revenue forecast for ${period || 'this_quarter'} using ${method || 'combined'} methodology. Org: ${org || 'default'}`
});
```

## Output

The forecast includes:
- **Summary metrics**: Total forecast, confidence level, vs. quota
- **Pipeline breakdown**: By stage, segment, rep
- **Historical comparison**: Variance from prior periods
- **Risk factors**: Deals at risk, coverage gaps
- **Scenario modeling**: Best/expected/worst case

## Related Commands

- `/pipeline-health` - Analyze pipeline quality
- `/win-loss` - Historical win rate analysis
