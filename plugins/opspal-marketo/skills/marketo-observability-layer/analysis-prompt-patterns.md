# Claude Analysis Prompt Patterns

Templates and strategies for Claude-powered marketing intelligence analysis.

## Performance Analysis

### Campaign Performance Prompt
```
Analyze this campaign performance data and provide actionable recommendations.

## Data
{{campaignMetrics}}

## Context
- Industry: B2B SaaS
- Baseline open rate: 25%
- Baseline click rate: 4%

## Required Analysis
1. Compare metrics to baseline
2. Identify underperforming campaigns
3. Suggest specific improvements
4. Flag any anomalies

## Output Format
- Executive summary (2-3 sentences)
- Key metrics table with status indicators
- Prioritized recommendations with expected impact
- Any warnings or anomalies detected
```

### Email Performance Prompt
```
Analyze email engagement patterns and suggest optimizations.

## Data
- Sent: {{sentCount}}
- Delivered: {{deliveredCount}}
- Opens: {{openCount}}
- Clicks: {{clickCount}}
- Bounces: {{bounceCount}}
- Unsubscribes: {{unsubCount}}

## Metrics
- Delivery Rate: {{deliveryRate}}%
- Open Rate: {{openRate}}%
- Click Rate: {{clickRate}}%
- CTR (click-to-open): {{ctr}}%
- Bounce Rate: {{bounceRate}}%

## Questions
1. How do these metrics compare to industry benchmarks?
2. What specific actions would improve performance?
3. Are there any warning signs in the data?
```

## Engagement Analysis

### Time Pattern Analysis
```
Analyze engagement patterns by time to identify optimal send times.

## Data
{{engagementByHour}}
{{engagementByDay}}

## Analysis Required
1. Identify peak engagement hours (top 3)
2. Identify best days of week
3. Compare to typical B2B patterns
4. Recommend optimal send schedule

## Output
- Best times to send (ranked)
- Times to avoid
- Confidence level in recommendations
```

### Lead Behavior Analysis
```
Analyze lead behavior patterns to identify engagement segments.

## Data
- Total leads: {{totalLeads}}
- Active (30 days): {{activeLeads}}
- Dormant (30-90 days): {{dormantLeads}}
- Inactive (90+ days): {{inactiveLeads}}

## Activity Breakdown
{{activityByType}}

## Analysis Required
1. Segment leads by engagement level
2. Identify re-engagement opportunities
3. Suggest targeted messaging strategies
4. Calculate expected response rates
```

## Funnel Analysis

### Conversion Funnel Prompt
```
Analyze the lead-to-customer conversion funnel.

## Funnel Data
{{funnelStages}}

## Required Analysis
1. Calculate stage-to-stage conversion rates
2. Identify bottlenecks (stages with >20% drop-off)
3. Compare to typical B2B funnel benchmarks
4. Suggest improvements for weakest stages

## Output Format
- Funnel visualization (text-based)
- Conversion rates by stage
- Bottleneck analysis with root causes
- Specific recommendations per stage
```

### Program Progression Analysis
```
Analyze program membership and success rates.

## Data
{{programMemberData}}

## Questions
1. What is the overall program success rate?
2. How long does it take leads to reach success?
3. Which statuses have the highest drop-off?
4. What actions could improve conversion?
```

## Anomaly Detection

### Metric Anomaly Prompt
```
Detect anomalies in the following marketing metrics.

## Current Metrics
{{currentMetrics}}

## Historical Baselines (30-day average)
{{baselineMetrics}}

## Standard Deviations
{{stdDeviations}}

## Detection Rules
- Warning: >1.5 standard deviations from baseline
- Critical: >2.0 standard deviations from baseline

## Required Output
1. List all anomalies with severity
2. Potential causes for each anomaly
3. Recommended actions
4. Urgency classification
```

### Trend Analysis
```
Analyze trends in key metrics over the past 30 days.

## Trend Data
{{trendData}}

## Analysis Required
1. Identify improving metrics
2. Identify declining metrics
3. Calculate rate of change
4. Project next 7-day values
5. Flag concerning trends
```

## Recommendation Generation

### Token Update Recommendation
```
Based on the analysis, recommend token updates.

## Current State
- Program: {{programName}} (ID: {{programId}})
- Current tokens: {{currentTokens}}

## Performance Data
{{performanceMetrics}}

## Generate Recommendations
For each recommended change:
1. Token name
2. Current value
3. Proposed value
4. Expected impact (%)
5. Confidence level (high/medium/low)
6. Auto-implement eligibility (yes/no)
```

### Segmentation Recommendation
```
Recommend segmentation improvements based on engagement data.

## Current Segments
{{currentSegments}}

## Engagement by Segment
{{segmentEngagement}}

## Analysis Required
1. Identify underperforming segments
2. Suggest new segmentation criteria
3. Recommend segment-specific messaging
4. Calculate expected lift
```

## Quality Control

### Analysis Quality Checklist
Before presenting analysis:
```
- [ ] Data recency verified (< 24 hours old)
- [ ] Minimum sample size met (1000+ records)
- [ ] Baseline comparisons included
- [ ] Confidence levels stated
- [ ] Actionability score > 70%
- [ ] No speculative recommendations
```

### Response Validation
```
Validate the analysis response:
1. Does it answer the original question?
2. Are recommendations specific and actionable?
3. Are confidence levels appropriate?
4. Is the expected impact realistic?
5. Are risks and caveats mentioned?
```

## Context Enhancement

### Adding Business Context
```
## Business Context
- Company: {{companyName}}
- Industry: {{industry}}
- Target audience: {{targetAudience}}
- Marketing goals: {{marketingGoals}}
- Recent campaigns: {{recentCampaigns}}
```

### Historical Context
```
## Historical Performance
- 30-day average open rate: {{avgOpenRate}}%
- 30-day average click rate: {{avgClickRate}}%
- Previous recommendations: {{previousRecs}}
- Implementation success rate: {{implSuccessRate}}%
```

## Output Templates

### Executive Summary Format
```
## Summary
{{2-3 sentence overview}}

## Key Metrics
| Metric | Current | Baseline | Status |
|--------|---------|----------|--------|
{{metricsTable}}

## Recommendations
1. **{{action1}}** [{{riskLevel}}]
   - Target: {{target}}
   - Expected Impact: {{impact}}
   - Confidence: {{confidence}}

## Anomalies
{{anomalyList}}
```

### Detailed Report Format
```
## Campaign Performance Analysis

### Executive Summary
{{summary}}

### Performance Breakdown
{{detailedMetrics}}

### Trend Analysis
{{trendAnalysis}}

### Recommendations
{{prioritizedRecommendations}}

### Implementation Plan
{{implementationSteps}}

### Appendix
- Data sources
- Methodology notes
- Confidence intervals
```
