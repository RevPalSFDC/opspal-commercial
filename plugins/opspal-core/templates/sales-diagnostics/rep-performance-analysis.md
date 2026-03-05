# Rep Performance Analysis - {{orgName}}

**Segmented by**: {{segmentDimension}}
**Analysis Period**: {{dateRange}}
**Generated**: {{generatedDate}}

---

## Overview

This report analyzes individual and team performance across {{totalReps}} sales representatives to identify coaching opportunities, best practices, and performance gaps.

**Average Efficiency Score**: {{avgEfficiencyScore}}/100

---

## Performance Distribution

### Efficiency Score Distribution

| Quartile | Score Range | Rep Count | Avg Win Rate | Avg Activities/Day |
|----------|-------------|-----------|--------------|-------------------|
| Top 25% | {{q4Range}} | {{q4Count}} | {{q4WinRate}} | {{q4Activities}} |
| Above Avg | {{q3Range}} | {{q3Count}} | {{q3WinRate}} | {{q3Activities}} |
| Below Avg | {{q2Range}} | {{q2Count}} | {{q2WinRate}} | {{q2Activities}} |
| Bottom 25% | {{q1Range}} | {{q1Count}} | {{q1WinRate}} | {{q1Activities}} |

---

## Individual Rep Scorecards

{{#each repScoreCards}}

### {{this.repName}} (ID: {{this.repId}})

**Overall Score**: {{this.efficiencyScore}}/100 ({{this.tier}})

#### Key Metrics

| Metric | Value | Team Avg | Variance | Benchmark |
|--------|-------|----------|----------|-----------|
| Activities/Day | {{this.activitiesPerDay}} | {{this.teamAvg.activities}} | {{this.variance.activities}} | {{this.benchmark.activities}} |
| Connect Rate | {{this.connectRate}} | {{this.teamAvg.connectRate}} | {{this.variance.connectRate}} | {{this.benchmark.connectRate}} |
| Meeting Set Rate | {{this.meetingSetRate}} | {{this.teamAvg.meetingSetRate}} | {{this.variance.meetingSetRate}} | {{this.benchmark.meetingSetRate}} |
| Pipeline Conversion | {{this.pipelineRate}} | {{this.teamAvg.pipelineRate}} | {{this.variance.pipelineRate}} | {{this.benchmark.pipelineRate}} |
| Win Rate | {{this.winRate}} | {{this.teamAvg.winRate}} | {{this.variance.winRate}} | {{this.benchmark.winRate}} |
| Avg Deal Size | {{this.avgDealSize}} | {{this.teamAvg.dealSize}} | {{this.variance.dealSize}} | {{this.benchmark.dealSize}} |

#### Activity Breakdown

- **Calls Made**: {{this.calls}} ({{this.callsPerDay}}/day)
- **Emails Sent**: {{this.emails}} ({{this.emailsPerDay}}/day)
- **Meetings Held**: {{this.meetingsHeld}}
- **Opportunities Created**: {{this.opportunitiesCreated}}
- **Deals Won**: {{this.dealsWon}} ({{this.totalRevenue}} revenue)

#### Strengths

{{#each this.strengths}}
- ✅ **{{this.area}}**: {{this.description}}
{{/each}}

#### Coaching Opportunities

{{#each this.coachingOpportunities}}
{{@index}}. **{{this.area}}** ({{this.priority}} priority)
   - Current: {{this.current}}
   - Target: {{this.target}}
   - Coaching Focus: {{this.coaching}}
   - Expected Impact: {{this.expectedImpact}}
{{/each}}

#### Best Practices to Replicate

{{#if this.bestPractices}}
{{#each this.bestPractices}}
- {{this}}
{{/each}}
{{else}}
*No specific best practices identified at this level*
{{/if}}

---

{{/each}}

---

## Top Performers Deep Dive

### What Top 25% Do Differently

{{#each topPerformerPractices}}
**{{this.practice}}**

- Top 25% Performance: {{this.topValue}}
- Average Performance: {{this.avgValue}}
- Impact: {{this.impact}}
- How to Replicate: {{this.replication}}

{{/each}}

### Common Traits of Top Performers

{{#each topPerformerTraits}}
- {{this.trait}}: {{this.description}}
{{/each}}

---

## Coaching Priorities

### High Priority (Immediate Attention Required)

{{#each highPriorityCoaching}}
**{{this.repName}}**

| Area | Current | Target | Gap | Coaching Plan |
|------|---------|--------|-----|---------------|
{{#each this.opportunities}}
| {{this.area}} | {{this.current}} | {{this.target}} | {{this.gap}} | {{this.coaching}} |
{{/each}}

**Recommended Actions**:
{{#each this.recommendedActions}}
- {{this}}
{{/each}}

---

{{/each}}

### Medium Priority

{{#each mediumPriorityCoaching}}
- **{{this.repName}}**: {{this.summary}}
{{/each}}

---

## Team Benchmarking

### Team/Region Comparison

| Team/Region | Reps | Avg Score | Avg Win Rate | Avg Activities/Day | Top Performer |
|-------------|------|-----------|--------------|-------------------|---------------|
{{#each teamComparison}}
| {{this.team}} | {{this.repCount}} | {{this.avgScore}} | {{this.avgWinRate}} | {{this.avgActivities}} | {{this.topPerformer}} |
{{/each}}

### Performance Variance by Team

{{#each teamVariance}}
**{{this.team}}**
- Efficiency Score Range: {{this.minScore}} - {{this.maxScore}}
- Standard Deviation: {{this.stdDev}}
- Consistency: {{this.consistency}} ({{this.interpretation}})
{{/each}}

**Insight**: {{#if lowVariance}}Teams with low variance indicate strong processes and consistent execution.{{else}}High variance suggests opportunity for standardization and knowledge sharing.{{/if}}

---

## Skill Gap Analysis

### Most Common Skill Gaps

| Skill Area | % of Reps Below Target | Avg Gap | Priority |
|------------|----------------------|---------|----------|
{{#each skillGaps}}
| {{this.skill}} | {{this.percentage}}% | {{this.avgGap}} | {{this.priority}} |
{{/each}}

### Recommended Training Programs

{{#each trainingRecommendations}}
**{{this.program}}**
- Target Skill: {{this.skill}}
- Target Audience: {{this.audience}}
- Expected Impact: {{this.expectedImpact}}
- Duration: {{this.duration}}
{{/each}}

---

## Attrition Risk Analysis

{{#if attritionRisk}}

### Reps at Risk

{{#each atRiskReps}}
**{{this.repName}}** ({{this.riskLevel}} risk)

Risk Indicators:
{{#each this.indicators}}
- {{this}}
{{/each}}

Recommended Interventions:
{{#each this.interventions}}
- {{this}}
{{/each}}

---

{{/each}}

{{else}}

*No significant attrition risk indicators detected*

{{/if}}

---

## Time-of-Day Optimization

### Best Performance Times by Rep Tier

| Tier | Best Time Slot | Success Rate | Activities in Slot |
|------|---------------|--------------|-------------------|
| Top 25% | {{topTier.bestTime}} | {{topTier.successRate}} | {{topTier.activities}} |
| Average | {{avgTier.bestTime}} | {{avgTier.successRate}} | {{avgTier.activities}} |
| Bottom 25% | {{bottomTier.bestTime}} | {{bottomTier.successRate}} | {{bottomTier.activities}} |

**Recommendation**: {{timeOptimizationRec}}

---

## Action Plan Summary

### Immediate Actions (This Week)

{{#each immediateActions}}
- {{this}}
{{/each}}

### 30-Day Coaching Plan

{{#each coachingPlan}}
**Week {{this.week}}**: {{this.focus}}
{{#each this.activities}}
- {{this}}
{{/each}}
{{/each}}

### Success Metrics

Track these metrics weekly to measure coaching effectiveness:

{{#each successMetrics}}
- {{this.metric}}: Baseline {{this.baseline}}, Target {{this.target}} ({{this.timeline}})
{{/each}}

---

## Knowledge Sharing Opportunities

### Best Practice Showcase

{{#each bestPracticeShowcase}}
**{{this.practice}}** (from {{this.repName}})

Description: {{this.description}}

How to Replicate:
{{#each this.steps}}
{{@index}}. {{this}}
{{/each}}

Expected Impact: {{this.expectedImpact}}

---

{{/each}}

---

*Generated by **OpsPal by RevPal** | gorevpal.com*
