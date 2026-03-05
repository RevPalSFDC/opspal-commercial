# Detection Strategies (Proactive Monitoring)

## Goal
Detect campaign issues early by correlating activities, metrics, and API health signals.

## Core Strategies

### Activity Log Correlation
- Detect missing campaign runs after trigger events.
- Compare trigger activity timestamps to downstream actions.

### Program Member Anomaly Checks
- Alert when success counts are zero or below thresholds.
- Flag programs with large early-stage accumulation.

### Trigger Queue Backlog Inference
- Measure time between trigger event and first flow activity.
- Alert on sustained delays beyond normal SLA.

### API Health Monitoring
- Track error codes 606/607/615 and bulk errors 1029.
- Auto-throttle when quota usage is high.

### Metric Threshold Alerts
- Bounce rate, unsub rate, open rate, and click rate thresholds.
- Alert on sudden deviation from baseline.

### Token Validation Preflight
- Scan email content for tokens and confirm definitions.
- Flag undefined my tokens prior to send or approval.

### Engagement Trend Analysis
- Compare recent campaign performance to historical baselines.
- Alert on sustained declines across segments.

## Recommended Cadence
- Near real-time: trigger correlation, API errors.
- Daily: engagement metrics, bounce/unsub trends.
- Weekly: program success rates and segment fatigue.

## Outputs
- Issue alerts with evidence links.
- Suggested routing to specific diagnostics modules.

## Related Runbooks
- `../observability-layer/08-continuous-intelligence.md`
- `../performance/api-optimization-guide.md`
