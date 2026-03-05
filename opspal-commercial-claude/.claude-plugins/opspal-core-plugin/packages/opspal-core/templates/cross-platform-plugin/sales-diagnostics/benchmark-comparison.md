# Benchmark Comparison - {{orgName}}

**Industry**: {{industry}}
**Analysis Period**: {{dateRange}}
**Generated**: {{generatedDate}}

---

## Overview

This report compares your organization's sales funnel metrics against {{industry}} industry benchmarks, including average performance and top quartile (top 25%) performers.

---

## Performance Summary

| Category | Metrics Below Benchmark | At/Above Benchmark | Top Quartile |
|----------|------------------------|-------------------|--------------|
| Prospecting | {{prospecting.below}} | {{prospecting.above}} | {{prospecting.topQuartile}} |
| Engagement | {{engagement.below}} | {{engagement.above}} | {{engagement.topQuartile}} |
| Meetings | {{meetings.below}} | {{meetings.above}} | {{meetings.topQuartile}} |
| Pipeline | {{pipeline.below}} | {{pipeline.above}} | {{pipeline.topQuartile}} |
| Closing | {{closing.below}} | {{closing.above}} | {{closing.topQuartile}} |

---

## Detailed Metrics Comparison

### Prospecting Metrics

| Metric | Your Org | Industry Avg | Top 25% | Variance | Tier |
|--------|----------|--------------|---------|----------|------|
{{#each prospectingMetrics}}
| {{this.name}} | {{this.orgValue}} | {{this.benchmark}} | {{this.topQuartile}} | {{this.variance}} | {{this.tier}} |
{{/each}}

### Engagement Metrics

| Metric | Your Org | Industry Avg | Top 25% | Variance | Tier |
|--------|----------|--------------|---------|----------|------|
{{#each engagementMetrics}}
| {{this.name}} | {{this.orgValue}} | {{this.benchmark}} | {{this.topQuartile}} | {{this.variance}} | {{this.tier}} |
{{/each}}

### Meeting Metrics

| Metric | Your Org | Industry Avg | Top 25% | Variance | Tier |
|--------|----------|--------------|---------|----------|------|
{{#each meetingMetrics}}
| {{this.name}} | {{this.orgValue}} | {{this.benchmark}} | {{this.topQuartile}} | {{this.variance}} | {{this.tier}} |
{{/each}}

### Pipeline Metrics

| Metric | Your Org | Industry Avg | Top 25% | Variance | Tier |
|--------|----------|--------------|---------|----------|------|
{{#each pipelineMetrics}}
| {{this.name}} | {{this.orgValue}} | {{this.benchmark}} | {{this.topQuartile}} | {{this.variance}} | {{this.tier}} |
{{/each}}

### Closing Metrics

| Metric | Your Org | Industry Avg | Top 25% | Variance | Tier |
|--------|----------|--------------|---------|----------|------|
{{#each closingMetrics}}
| {{this.name}} | {{this.orgValue}} | {{this.benchmark}} | {{this.topQuartile}} | {{this.variance}} | {{this.tier}} |
{{/each}}

---

## Performance Tier Legend

- 🏆 **Top Quartile** - Top 25% performance (celebrate!)
- ✅ **Above Average** - Above industry average
- ➡️ **Average** - At industry average
- ⚠️ **Below Average** - Below acceptable threshold (needs attention)

---

## Gap Analysis

### Critical Gaps (30%+ below benchmark)

{{#each criticalGaps}}
**{{this.metric}}**
- Current: {{this.current}}
- Benchmark: {{this.benchmark}}
- Gap: {{this.gap}} ({{this.variance}})
- **Impact**: {{this.impact}}

{{/each}}

### Significant Gaps (20-30% below benchmark)

{{#each significantGaps}}
- **{{this.metric}}**: {{this.current}} vs {{this.benchmark}} ({{this.variance}})
{{/each}}

---

## Industry Context

### {{industry}} Benchmarks

These benchmarks are based on aggregated data from {{sampleSize}} companies in the {{industry}} industry:

**Typical Sales Cycle**: {{typicalCycle}}
**Average Deal Size**: {{avgDealSize}}
**Target Pipeline Coverage**: {{pipelineCoverage}}
**Expected Win Rate**: {{expectedWinRate}}

### Key Industry Characteristics

{{#each industryCharacteristics}}
- **{{this.characteristic}}**: {{this.description}}
{{/each}}

---

*Generated with sales-funnel-diagnostic agent*
