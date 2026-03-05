---
description: Trigger Claude analysis on Marketo data and generate optimization recommendations
argument-hint: "[--scope=campaign|program|full] [--type=performance|engagement|funnel|anomaly]"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# /analyze-performance

Trigger Claude-powered analysis on your Marketo data to generate insights and actionable recommendations.

## Analysis Types

### Performance Analysis (default)
Evaluate campaign and email effectiveness:
- Open/click rates vs benchmarks
- Bounce and unsubscribe trends
- Delivery health

### Engagement Analysis
Identify patterns in lead behavior:
- Optimal send times
- Day-of-week patterns
- Score progression trends

### Funnel Analysis
Track lead progression through stages:
- Conversion rates between stages
- Bottleneck identification
- Time-to-conversion metrics

### Anomaly Detection
Identify unusual patterns:
- Below-baseline metrics
- Sudden changes
- Deliverability issues

## Pre-Analysis Validation

Before analysis, the system checks:
- Data freshness (warn if > 24 hours old)
- Minimum data volume (1000+ records recommended)
- File integrity

```
╔══════════════════════════════════════════════════════════════╗
║  DATA VALIDATION                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Leads Data:                                                  ║
║    Age:        8 hours ✓                                      ║
║    Records:    45,230 ✓                                       ║
║                                                               ║
║  Activities Data:                                             ║
║    Age:        7 hours ✓                                      ║
║    Records:    125,890 ✓                                      ║
║                                                               ║
║  ✓ Data ready for analysis                                    ║
╚══════════════════════════════════════════════════════════════╝
```

## Analysis Output

### Executive Summary
```
## Campaign Performance Analysis

### Summary
Overall marketing performance is HEALTHY with minor areas for optimization.
Email engagement is on-target with industry benchmarks. Program conversion
rates are strong at 35% success. One anomaly detected in Segment B engagement.

### Key Metrics
| Metric | Current | Baseline | Status |
|--------|---------|----------|--------|
| Open Rate | 23.5% | 25.0% | ⚠️ Slightly Below |
| Click Rate | 4.2% | 4.0% | ✓ On Target |
| Bounce Rate | 1.8% | 2.0% | ✓ Healthy |
| Program Success | 35% | 30% | ✓ Above Target |
```

### Recommendations
```
### Recommendations

1. **Token Update** [Auto-Implement]
   Update {{my.Subject_Line}} in Q1 Nurture to include personalization
   - Target: Program 1044, Token "my.Subject_Line"
   - New Value: "{{lead.firstName}}, your exclusive offer awaits"
   - Expected Impact: +3-5% open rate
   - Confidence: High

2. **Wait Time Adjustment** [Auto-Implement]
   Reduce wait between Email 1 and Email 2 from 5 days to 3 days
   - Target: Campaign 2001, Step 3
   - Current: 5 days, Proposed: 3 days (-40%)
   - Expected Impact: +2% progression rate
   - Confidence: Medium

3. **Segmentation Change** [Requires Approval]
   Split Segment B by engagement recency (30/60/90 days)
   - Impact: Enables targeted re-engagement messaging
   - Expected Impact: +5-8% engagement for dormant leads
   - Risk: Medium - affects multiple campaigns
```

### Anomalies
```
### Anomalies Detected

⚠️ WARNING: Low Open Rate in Segment B
   - Current: 15%
   - Expected: 25%
   - Deviation: 2.0 standard deviations below baseline
   - Likely Cause: List fatigue or deliverability issue
   - Recommended Action: Review list hygiene, check spam scores
```

## Auto-Implementation

Low-risk recommendations are auto-implemented:
- Token updates
- Wait time adjustments (≤50% change)
- Subject line A/B tests (created in draft)

High-risk changes are queued for approval:
- Flow step changes
- Segmentation changes
- Campaign activation changes

```
╔══════════════════════════════════════════════════════════════╗
║  IMPLEMENTATION STATUS                                        ║
╠══════════════════════════════════════════════════════════════╣
║  Auto-Implemented:                                            ║
║    ✓ Token update: my.Subject_Line (Program 1044)            ║
║    ✓ Wait time: 5 days → 3 days (Campaign 2001)              ║
║                                                               ║
║  Queued for Approval:                                         ║
║    ⏳ Segmentation change: Segment B split                    ║
║                                                               ║
║  Impact measurement scheduled for 2 days, 7 days              ║
╚══════════════════════════════════════════════════════════════╝
```

## Options

| Option | Description |
|--------|-------------|
| `--scope` | Analysis scope: campaign, program, full (default) |
| `--type` | Analysis type: performance, engagement, funnel, anomaly |
| `--program-id` | Analyze specific program |
| `--campaign-id` | Analyze specific campaign |
| `--no-auto-implement` | Generate recommendations only, don't auto-implement |
| `--json` | Output in JSON format |

## Example Usage

```
# Full performance analysis with auto-implementation
/analyze-performance

# Engagement patterns only
/analyze-performance --type=engagement

# Specific program analysis
/analyze-performance --program-id=1044

# Generate recommendations without implementing
/analyze-performance --no-auto-implement

# Anomaly detection
/analyze-performance --type=anomaly

# JSON output for integration
/analyze-performance --json
```

## After Analysis

Review results and next steps:
1. Check `/observability-dashboard` for updated metrics
2. Review pending approvals in recommendations queue
3. Monitor auto-implemented changes via impact measurements
4. Re-run in 7 days to assess impact

## Related Commands

- `/extract-wizard` - Refresh data before analysis
- `/observability-dashboard` - View current status
- `/observability-setup` - Configure automation
