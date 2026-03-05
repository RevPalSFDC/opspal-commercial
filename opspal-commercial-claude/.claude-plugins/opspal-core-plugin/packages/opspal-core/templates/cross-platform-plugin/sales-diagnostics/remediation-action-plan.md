# Remediation Action Plan - {{orgName}}

**Priority-Ranked Recommendations with Implementation Roadmap**

**Generated**: {{generatedDate}}
**Planning Horizon**: 12 months

---

## Implementation Overview

This action plan prioritizes {{totalRecommendations}} recommendations across 3 implementation phases based on:
- **Revenue Impact**: Estimated incremental revenue
- **Implementation Effort**: Time and resources required
- **Risk Level**: Change management complexity

---

## Phase 1: Quick Wins (0-30 Days)

**Target**: High-impact, low-effort improvements
**Expected Combined Impact**: {{phase1Impact}}

{{#each phase1Actions}}
### Action {{@index}}: {{this.title}}

**Priority Score**: {{this.priorityScore}}/100

**Problem Statement**:
{{this.problem}}

**Root Cause**:
{{this.rootCause}}

**Recommended Action**:
{{this.action}}

**Implementation Steps**:
{{#each this.steps}}
{{@index}}. {{this}}
{{/each}}

**Expected Impact**:
- Metric: {{this.targetMetric}}
- Current: {{this.current}}
- Target: {{this.target}}
- Improvement: {{this.improvement}}
- Revenue Impact: {{this.revenueImpact}}

**Resources Required**:
- Owner: {{this.owner}}
- Team: {{this.team}}
- Time: {{this.timeRequired}}
- Budget: {{this.budget}}

**Success Metrics**:
{{#each this.successMetrics}}
- {{this.metric}}: {{this.target}}
{{/each}}

**Timeline**:
- Start: Week 1
- Complete: {{this.deadline}}

---

{{/each}}

## Phase 2: Process Improvements (30-90 Days)

**Target**: Systematic process changes
**Expected Combined Impact**: {{phase2Impact}}

{{#each phase2Actions}}
### Action {{@index}}: {{this.title}}

**Priority Score**: {{this.priorityScore}}/100

**Problem**: {{this.problem}}

**Recommended Action**: {{this.action}}

**Implementation**:
{{#each this.steps}}
- {{this}}
{{/each}}

**Expected Impact**: {{this.expectedImpact}}

**Resources**: {{this.resources}}

**Timeline**: {{this.timeline}}

---

{{/each}}

## Phase 3: Systematic Changes (90+ Days)

**Target**: Strategic initiatives requiring significant investment
**Expected Combined Impact**: {{phase3Impact}}

{{#each phase3Actions}}
### Action {{@index}}: {{this.title}}

**Priority Score**: {{this.priorityScore}}/100

**Strategic Rationale**: {{this.rationale}}

**Recommended Action**: {{this.action}}

**Implementation Plan**:
{{#each this.phases}}
**{{this.phaseName}}** ({{this.duration}}):
{{#each this.steps}}
- {{this}}
{{/each}}
{{/each}}

**Expected Impact**: {{this.expectedImpact}}

**Investment Required**: {{this.investment}}

**ROI Timeline**: {{this.roiTimeline}}

---

{{/each}}

---

## Resource Requirements Summary

### Phase 1 (0-30 Days)
- **Budget**: {{phase1Budget}}
- **FTEs**: {{phase1FTEs}}
- **Key Roles**: {{phase1Roles}}

### Phase 2 (30-90 Days)
- **Budget**: {{phase2Budget}}
- **FTEs**: {{phase2FTEs}}
- **Key Roles**: {{phase2Roles}}

### Phase 3 (90+ Days)
- **Budget**: {{phase3Budget}}
- **FTEs**: {{phase3FTEs}}
- **Key Roles**: {{phase3Roles}}

**Total Investment**: {{totalBudget}}
**Expected Annual Return**: {{expectedReturn}}
**ROI**: {{roi}}

---

## Success Tracking Framework

### Monthly Check-ins
Review these metrics monthly to measure progress:

{{#each monthlyMetrics}}
- **{{this.metric}}**: Baseline {{this.baseline}}, Target {{this.target}}
{{/each}}

### Quarterly Reviews
Comprehensive funnel diagnostic every quarter:
- Re-run `/diagnose-sales-funnel` command
- Compare to baseline (this report)
- Adjust action plan based on results

---

## Risk Mitigation

{{#each risks}}
### Risk: {{this.risk}}

**Likelihood**: {{this.likelihood}}
**Impact**: {{this.impact}}

**Mitigation Strategy**:
{{this.mitigation}}

---

{{/each}}

---

## Implementation Checklist

### Week 1
{{#each week1Tasks}}
- [ ] {{this}}
{{/each}}

### Week 2-4
{{#each week2to4Tasks}}
- [ ] {{this}}
{{/each}}

### Month 2-3
{{#each month2to3Tasks}}
- [ ] {{this}}
{{/each}}

### Quarter 2+
{{#each quarter2Tasks}}
- [ ] {{this}}
{{/each}}

---

*Generated with sales-funnel-diagnostic agent*
