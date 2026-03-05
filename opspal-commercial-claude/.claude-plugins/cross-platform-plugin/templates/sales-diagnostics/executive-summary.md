# Sales Funnel Diagnostic - Executive Summary

**Organization**: {{orgName}}
**Industry**: {{industry}}
**Analysis Period**: {{dateRange}}
**Report Generated**: {{generatedDate}}
**Overall Performance**: {{performanceTier}}

---

## Executive Overview

This diagnostic analyzed {{totalOpportunities}} opportunities, {{totalActivities}} sales activities, and {{totalMeetings}} meetings across your {{dateRange}} sales funnel. The analysis compares your performance against {{industry}} industry benchmarks to identify the highest-impact improvement opportunities.

### Overall Health Score: {{qualityScore}}/100

{{#if (eq performanceTier "Top Quartile")}}
**🏆 Excellent Performance** - Your sales funnel is performing in the top 25% of {{industry}} companies. Focus on replicating best practices and maintaining momentum.
{{else if (eq performanceTier "Above Average")}}
**✅ Good Performance** - Your sales funnel performs above industry average with specific areas for optimization.
{{else if (eq performanceTier "Average")}}
**➡️ Average Performance** - Your sales funnel performs at industry average. Significant opportunity for improvement exists.
{{else}}
**⚠️ Below Average Performance** - Your sales funnel is underperforming {{industry}} benchmarks. Immediate action recommended on critical gaps.
{{/if}}

---

## Key Findings

### 🔴 Critical Issues

{{#each topFindings}}
{{#if (eq this.severity "critical")}}
**{{this.number}}. {{this.title}}**

- **Current Performance**: {{this.current}}
- **Benchmark**: {{this.benchmark}}
- **Gap**: {{this.gap}} ({{this.variancePercent}})
- **Business Impact**: {{this.businessImpact}}
- **Root Cause**: {{this.rootCause}}

{{/if}}
{{/each}}

{{#unless (hasCriticalFindings topFindings)}}
✓ No critical issues identified
{{/unless}}

### ⚠️ Significant Opportunities

{{#each topFindings}}
{{#if (eq this.severity "significant")}}
**{{this.number}}. {{this.title}}**

- **Current**: {{this.current}} | **Benchmark**: {{this.benchmark}} | **Gap**: {{this.gap}}
- **Impact**: {{this.businessImpact}}
- **Recommendation**: {{this.primaryRecommendation}}

{{/if}}
{{/each}}

### ✅ Strengths

{{#each strengths}}
- **{{this.area}}**: {{this.description}} ({{this.performance}} vs benchmark)
{{/each}}

---

## Business Impact Analysis

### Revenue Opportunity

**Estimated Annual Revenue at Risk**: {{revenueAtRisk}}

This represents the incremental revenue opportunity from closing identified performance gaps:

{{#each impactBreakdown}}
- **{{this.area}}**: {{this.impact}} ({{this.confidence}} confidence)
  - Current: {{this.current}}
  - Target: {{this.target}}
  - Expected lift: {{this.expectedLift}}
{{/each}}

### Key Metrics Summary

| Metric | Your Org | {{industry}} Avg | Top 25% | Gap |
|--------|----------|------------------|---------|-----|
{{#each keyMetrics}}
| {{this.name}} | {{this.orgValue}} | {{this.avgValue}} | {{this.topQuartile}} | {{this.gap}} |
{{/each}}

---

## Top 3 Priorities

These recommendations are prioritized by expected revenue impact and implementation feasibility:

### Priority #1: {{priority1.title}} (Score: {{priority1.priorityScore}}/100)

**What's Happening**: {{priority1.symptom}}

**Root Cause**: {{priority1.rootCause}}

**Recommended Action**: {{priority1.action}}

**Expected Impact**: {{priority1.expectedImpact}}

**Timeline**: {{priority1.timeline}}

**Quick Wins**:
{{#each priority1.quickWins}}
- {{this}}
{{/each}}

---

### Priority #2: {{priority2.title}} (Score: {{priority2.priorityScore}}/100)

**What's Happening**: {{priority2.symptom}}

**Root Cause**: {{priority2.rootCause}}

**Recommended Action**: {{priority2.action}}

**Expected Impact**: {{priority2.expectedImpact}}

**Timeline**: {{priority2.timeline}}

---

### Priority #3: {{priority3.title}} (Score: {{priority3.priorityScore}}/100)

**What's Happening**: {{priority3.symptom}}

**Root Cause**: {{priority3.rootCause}}

**Recommended Action**: {{priority3.action}}

**Expected Impact**: {{priority3.expectedImpact}}

**Timeline**: {{priority3.timeline}}

---

## Implementation Roadmap

### Phase 1: Quick Wins (0-30 days)
Focus on high-impact, low-effort changes:

{{#each quickWins}}
- **{{this.action}}** → Expected: {{this.expectedImpact}}
{{/each}}

**Expected Combined Impact**: {{quickWinsImpact}}

### Phase 2: Process Improvements (30-90 days)
Implement systematic process changes:

{{#each processImprovements}}
- **{{this.action}}** → Expected: {{this.expectedImpact}}
{{/each}}

**Expected Combined Impact**: {{processImprovementsImpact}}

### Phase 3: Systematic Changes (90+ days)
Strategic initiatives requiring significant investment:

{{#each systematicChanges}}
- **{{this.action}}** → Expected: {{this.expectedImpact}}
{{/each}}

**Expected Combined Impact**: {{systematicChangesImpact}}

---

## Success Metrics

Track these KPIs monthly to measure progress:

### Primary Metrics (North Star)
{{#each primaryMetrics}}
- **{{this.name}}**: Current {{this.current}} → Target {{this.target}} ({{this.timeline}})
{{/each}}

### Secondary Metrics (Leading Indicators)
{{#each secondaryMetrics}}
- {{this.name}}: {{this.current}} → {{this.target}}
{{/each}}

---

## Next Steps

### Immediate Actions (This Week)
1. {{nextStep1}}
2. {{nextStep2}}
3. {{nextStep3}}

### Team Alignment (Next 30 Days)
1. Share this diagnostic with sales leadership
2. Conduct team workshop on top 3 priorities
3. Assign owners for Phase 1 quick wins
4. Establish weekly progress check-ins

### Ongoing Monitoring
- Run funnel diagnostics quarterly
- Track KPIs weekly
- Adjust based on results

---

## Conclusion

{{#if (gte qualityScore 80)}}
Your sales funnel demonstrates strong fundamentals with specific opportunities for optimization. The top 3 priorities outlined above represent the highest-impact improvements.
{{else if (gte qualityScore 60)}}
Your sales funnel has solid foundations but shows notable gaps compared to {{industry}} benchmarks. The recommended actions will significantly improve performance.
{{else}}
Your sales funnel requires immediate attention on critical gaps. The phased implementation roadmap prioritizes the highest-impact improvements for maximum ROI.
{{/if}}

**Projected Impact**: Implementing the top 3 priorities is expected to generate **{{projectedImpact}}** in incremental annual revenue with {{confidenceLevel}} confidence.

For detailed analysis, remediation plans, and rep-level insights, see the full diagnostic report.

---

**Contact**: For questions about this diagnostic or implementation support:
- Diagnostic Agent: sales-funnel-diagnostic (cross-platform-plugin)
- Command: `/diagnose-sales-funnel`
- Documentation: `docs/SALES_FUNNEL_DIAGNOSTIC_IMPLEMENTATION.md`

---

*Report generated with Claude Code (claude.com/claude-code)*
*Cross-Platform Plugin v1.7.0*
