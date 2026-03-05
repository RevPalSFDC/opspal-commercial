# Sales Funnel Diagnostic - Full Report

**Organization**: {{orgName}}
**Industry**: {{industry}}
**Analysis Period**: {{dateRange}}
**Report Generated**: {{generatedDate}}

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Data Overview](#data-overview)
3. [Funnel Flow Analysis](#funnel-flow-analysis)
4. [Stage-by-Stage Analysis](#stage-by-stage-analysis)
5. [Activity Analysis](#activity-analysis)
6. [Root Cause Diagnostics](#root-cause-diagnostics)
7. [Segmentation Insights](#segmentation-insights)
8. [Appendix](#appendix)

---

## Executive Summary

### Key Findings
{{#each topFindings}}
{{@index}}. **{{this.title}}**: {{this.summary}}
{{/each}}

### Overall Performance
- **Quality Score**: {{qualityScore}}/100
- **Performance Tier**: {{performanceTier}}
- **Critical Gaps**: {{criticalGapCount}}
- **Top Priority**: {{topPriority}}

---

## Data Overview

### Data Collection Summary

| Metric | Count | Quality |
|--------|-------|---------|
| Opportunities | {{opportunityCount}} | {{opportunityQuality}} |
| Activities | {{activityCount}} | {{activityQuality}} |
| Meetings | {{meetingCount}} | {{meetingQuality}} |
| Leads/Contacts | {{leadCount}} | {{leadQuality}} |

### Date Range
- **Start**: {{dateRangeStart}}
- **End**: {{dateRangeEnd}}
- **Duration**: {{dateRangeDays}} days
- **Data Quality Score**: {{dataQualityScore}}/100

### Platform Coverage
{{#if salesforceData}}
- ✓ Salesforce data included
{{/if}}
{{#if hubspotData}}
- ✓ HubSpot data included
{{/if}}

---

## Funnel Flow Analysis

### Overall Conversion Flow

```
{{totalLeads}} Leads/Contacts
  ↓ {{leadToContactRate}}%
{{totalContacted}} Contacted
  ↓ {{contactToMeetingRate}}%
{{totalMeetings}} Meetings Held
  ↓ {{meetingToOpportunityRate}}%
{{totalOpportunities}} Opportunities
  ↓ {{opportunityToWonRate}}%
{{totalWon}} Closed-Won ({{avgDealSize}} avg)
```

### Conversion Rates by Stage

| From Stage | To Stage | Your Org | Industry Avg | Gap |
|------------|----------|----------|--------------|-----|
{{#each conversionRates}}
| {{this.from}} | {{this.to}} | {{this.orgRate}} | {{this.benchmark}} | {{this.gap}} |
{{/each}}

### Funnel Leakage Analysis

Largest drop-offs in your funnel:

{{#each leakagePoints}}
{{@index}}. **{{this.stage}}**: {{this.dropoff}}% loss
   - Volume lost: {{this.volumeLost}}
   - Revenue impact: {{this.revenueImpact}}
   - Root cause: {{this.rootCause}}
{{/each}}

---

## Stage-by-Stage Analysis

### Stage 1: Prospecting

**Metrics**:
- Total outreach activities: {{prospecting.totalActivities}}
- Calls made: {{prospecting.calls}}
- Emails sent: {{prospecting.emails}}
- Activity per rep per day: {{prospecting.activityPerRepPerDay}}

**Performance vs Benchmark**:
| Metric | Your Org | Benchmark | Variance |
|--------|----------|-----------|----------|
{{#each prospecting.metrics}}
| {{this.name}} | {{this.value}} | {{this.benchmark}} | {{this.variance}} |
{{/each}}

**Findings**:
{{#each prospecting.findings}}
- {{this.severity}} {{this.finding}}
{{/each}}

---

### Stage 2: Engagement

**Metrics**:
- Connect rate: {{engagement.connectRate}}
- Response rate: {{engagement.responseRate}}
- Average time to first response: {{engagement.avgResponseTime}}

**Performance vs Benchmark**:
| Metric | Your Org | Benchmark | Variance |
|--------|----------|-----------|----------|
{{#each engagement.metrics}}
| {{this.name}} | {{this.value}} | {{this.benchmark}} | {{this.variance}} |
{{/each}}

**Findings**:
{{#each engagement.findings}}
- {{this.severity}} {{this.finding}}
{{/each}}

---

### Stage 3: Meetings

**Metrics**:
- Meetings set: {{meetings.set}}
- Meetings held: {{meetings.held}}
- No-show rate: {{meetings.noShowRate}}
- Meeting-to-opportunity conversion: {{meetings.toOpportunityRate}}

**Performance vs Benchmark**:
| Metric | Your Org | Benchmark | Variance |
|--------|----------|-----------|----------|
{{#each meetings.metrics}}
| {{this.name}} | {{this.value}} | {{this.benchmark}} | {{this.variance}} |
{{/each}}

**Findings**:
{{#each meetings.findings}}
- {{this.severity}} {{this.finding}}
{{/each}}

---

### Stage 4: Pipeline

**Metrics**:
- Opportunities created: {{pipeline.created}}
- Average deal size: {{pipeline.avgDealSize}}
- Pipeline coverage: {{pipeline.coverage}}
- Avg sales cycle: {{pipeline.avgCycle}} days

**Performance vs Benchmark**:
| Metric | Your Org | Benchmark | Variance |
|--------|----------|-----------|----------|
{{#each pipeline.metrics}}
| {{this.name}} | {{this.value}} | {{this.benchmark}} | {{this.variance}} |
{{/each}}

**Findings**:
{{#each pipeline.findings}}
- {{this.severity}} {{this.finding}}
{{/each}}

---

### Stage 5: Closing

**Metrics**:
- Win rate: {{closing.winRate}}
- Loss rate: {{closing.lossRate}}
- No-decision rate: {{closing.noDecisionRate}}
- Average time in closing: {{closing.avgTime}} days

**Performance vs Benchmark**:
| Metric | Your Org | Benchmark | Variance |
|--------|----------|-----------|----------|
{{#each closing.metrics}}
| {{this.name}} | {{this.value}} | {{this.benchmark}} | {{this.variance}} |
{{/each}}

**Loss Reasons**:
{{#each closing.lossReasons}}
- {{this.reason}}: {{this.percentage}}%
{{/each}}

**Findings**:
{{#each closing.findings}}
- {{this.severity}} {{this.finding}}
{{/each}}

---

## Activity Analysis

### Activity Volume

| Rep Tier | Avg Daily Activities | Calls | Emails | Meetings |
|----------|---------------------|-------|--------|----------|
| Top 25% | {{topQuartile.activities}} | {{topQuartile.calls}} | {{topQuartile.emails}} | {{topQuartile.meetings}} |
| Average | {{average.activities}} | {{average.calls}} | {{average.emails}} | {{average.meetings}} |
| Bottom 25% | {{bottomQuartile.activities}} | {{bottomQuartile.calls}} | {{bottomQuartile.emails}} | {{bottomQuartile.meetings}} |

### Activity Efficiency

| Metric | Top Performers | Average | Gap |
|--------|---------------|---------|-----|
{{#each efficiencyMetrics}}
| {{this.name}} | {{this.topValue}} | {{this.avgValue}} | {{this.gap}} |
{{/each}}

### Time-of-Day Analysis

Best times for outreach based on connect/response rates:

{{#each timeSlotAnalysis}}
- **{{this.slot}}**: {{this.successRate}}% success rate ({{this.activities}} activities)
{{/each}}

---

## Root Cause Diagnostics

{{#each diagnostics}}
### Diagnostic {{@index}}: {{this.symptom}}

**Confidence**: {{this.confidence}}%
**Priority Score**: {{this.priorityScore}}/100

**Root Causes** (ranked by likelihood):
{{#each this.rootCauses}}
{{@index}}. **{{this.cause}}** ({{this.likelihood}}% likelihood)
   - Indicators: {{this.indicators}}
   - Remediation: {{this.remediation}}
   - Expected impact: {{this.expectedImpact}}
{{/each}}

---

{{/each}}

---

## Segmentation Insights

{{#if segmentation}}

### Performance by {{segmentDimension}}

| {{segmentDimension}} | Opportunities | Win Rate | Avg Deal Size | Efficiency Score |
|----------|---------------|----------|---------------|------------------|
{{#each segmentAnalysis}}
| {{this.segment}} | {{this.opportunities}} | {{this.winRate}} | {{this.avgDealSize}} | {{this.efficiencyScore}} |
{{/each}}

### Variance Analysis

{{#each segmentVariance}}
- **{{this.segment}}**: {{this.variance}} vs average ({{this.significance}})
{{/each}}

{{else}}

*No segmentation analysis requested*

{{/if}}

---

## Appendix

### Methodology

This diagnostic uses:
- **Industry benchmarks**: Aggregated from {{benchmarkSource}}
- **Statistical methods**: Significance testing at 95% confidence
- **Pattern matching**: 15+ diagnostic rules
- **Segmentation**: Optional by rep, team, region

### Assumptions

{{#each assumptions}}
- {{this}}
{{/each}}

### Limitations

{{#each limitations}}
- {{this}}
{{/each}}

### Data Quality Notes

{{#each dataQualityNotes}}
- {{this}}
{{/each}}

---

*Generated by **OpsPal by RevPal** | gorevpal.com*
