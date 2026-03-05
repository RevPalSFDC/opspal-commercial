# CPQ Assessment Report Templates

## Executive Summary (BLUF+4 Format)

**Word Limit**: 150-220 words total

```markdown
## Executive Summary

### Bottom Line (25-40 words)
[Clear recommendation: KEEP/OPTIMIZE/REMOVE with primary justification]

### Situation (30-50 words)
[Current CPQ state: utilization score, adoption pattern, key metrics]

### Next Steps (35-55 words)
[Prioritized actions: 3-5 specific recommendations in order of priority]

### Risks/Blockers (25-40 words)
[Impediments: data gaps, dependencies, resource constraints]

### Support Needed (20-35 words)
[Decisions, approvals, or resources required from stakeholders]
```

### Example Executive Summary

```markdown
## Executive Summary

### Bottom Line
**OPTIMIZE**: CPQ utilization at 42% with strong recent adoption (100% of quotes in past 6 months).
Investment in user training and pricing rule consolidation will drive ROI within 6 months.

### Situation
CPQ is actively used for all new business. Historical 22% contract linkage is legacy;
recent contracts show 100% CPQ integration. Pricing complexity score is 87 (MODERATE)
with 12 active price rules.

### Next Steps
1. Consolidate 4 redundant price rules (Week 1-2)
2. Conduct user training for 8 underutilizing reps (Week 3-4)
3. Implement quote template standardization (Week 5-6)
4. Establish monthly CPQ metrics review

### Risks/Blockers
- Training scheduling conflicts with Q4 close
- 3 price rules require business owner review before consolidation
- Template changes need legal approval

### Support Needed
- Executive sponsor for training mandate
- Legal review of template changes
- Business owner decisions on 3 price rule exceptions
```

---

## Phase Reports

### Phase 1: Discovery Report

```markdown
# Phase 1: Discovery with Time-Series Analysis

## CPQ Quote Volume

| Metric | Value | Notes |
|--------|-------|-------|
| Total CPQ Quotes | [X] | All time |
| Recent (6 months) | [X] | Active period |
| Latest Record | [Date] | Recency check |

## Time-Series Pattern

**Pattern Detected**: [active/growing/stable/declining/abandoned]

[Monthly chart or table showing quote volume trend]

## Dual-System Analysis

**Native Quotes Present**: [Yes/No]
**Relationship**: [PARALLEL_ACTIVE/MIGRATION_IN_PROGRESS/MIGRATION_COMPLETE/LEGACY_DOMINANT]

## Data Quality Assessment

| Check | Result | Confidence Impact |
|-------|--------|-------------------|
| Query completeness | [Pass/Warn/Fail] | [+X%/-X%] |
| Recency validation | [Pass/Warn/Fail] | [+X%/-X%] |
| Pattern clarity | [Pass/Warn/Fail] | [+X%/-X%] |

**Overall Confidence**: [X]% ([HIGH/MEDIUM/LOW])
```

### Phase 2: Utilization Report

```markdown
# Phase 2: Utilization Analysis

## Subscription Metrics

| Metric | Total | Recent (6mo) | Trend |
|--------|-------|--------------|-------|
| Subscriptions | [X] | [X] | [↑/↓/→] |
| Contract Linkage | [X%] | [X%] | [↑/↓/→] |

## Opportunity Quote Adoption

| Metric | Historical | Recent (6mo) |
|--------|------------|--------------|
| Total Opportunities | [X] | [X] |
| With CPQ Quote | [X] ([X%]) | [X] ([X%]) |
| Quote-to-Win Rate | [X%] | [X%] |

## Utilization Score Calculation

```
Score = (Quote Adoption % + Product CPQ Adoption %) / 2
      = ([X%] + [X%]) / 2
      = [X%]
```

**Utilization Rating**: [LOW/MEDIUM/HIGH]
**Preliminary Recommendation**: [REMOVE/OPTIMIZE/KEEP]

## Critical Distinction

> **Historical vs Current State**
>
> Overall contract linkage shows [X%] due to legacy data.
> However, **[X%] of recent contracts** (past 6 months) are CPQ-linked,
> indicating [current adoption pattern].
```

### Phase 3: Configuration Report

```markdown
# Phase 3: Configuration Review

## Pricing Automation

| Component | Count | Status | Notes |
|-----------|-------|--------|-------|
| Active Price Rules | [X] | [OK/WARN/CRIT] | Max recommended: 15 |
| Price Actions | [X] | [OK/WARN/CRIT] | Max recommended: 25 |
| Discount Schedules | [X] | [OK/WARN/CRIT] | |

**Pricing Complexity Score**: [X] ([SIMPLE/MODERATE/COMPLEX])

## Product Configuration

| Component | Count | Status |
|-----------|-------|--------|
| Product Bundles | [X] | |
| Subscription Products | [X] | |
| Product Options | [X] | Max recommended: 500 |
| Active Product Rules | [X] | Max recommended: 30 |

## Catalog Health

| Metric | Value | Benchmark |
|--------|-------|-----------|
| Total Products | [X] | Optimal: < 200 |
| Active Products | [X] ([X%]) | Target: > 70% |
| CPQ-Enabled Products | [X] ([X%]) | |

**Catalog Health Score**: [X%] ([HEALTHY/MODERATE/NEEDS ATTENTION])

## CPQ Report Usage (if audited)

| Report Category | Usage | Insight |
|-----------------|-------|---------|
| Quote Reports | [High/Medium/Low/None] | |
| Product Reports | [High/Medium/Low/None] | |
| Pricing Reports | [High/Medium/Low/None] | |
| Subscription Reports | [High/Medium/Low/None] | |

**Reporting Insight**: [Summary of what report usage tells us about CPQ adoption]
```

### Phase 4: Recommendations Report

```markdown
# Phase 4: Recommendations

## Overall Assessment

| Dimension | Score | Rating | Weight |
|-----------|-------|--------|--------|
| Utilization | [X%] | [HIGH/MED/LOW] | 40% |
| Configuration | [X] | [SIMPLE/MOD/COMPLEX] | 30% |
| Catalog Health | [X%] | [HEALTHY/MOD/NEEDS] | 20% |
| Data Quality | [X%] | [HIGH/MED/LOW] | 10% |

**Weighted Score**: [X]
**Recommendation**: [KEEP/OPTIMIZE/REMOVE]
**Confidence**: [X%] ([HIGH/MEDIUM/LOW])

## Confidence Factors

[List factors that increased or decreased confidence]

## Prioritized Recommendations

### Priority 1: [Recommendation]
- **Impact**: [High/Medium/Low]
- **Effort**: [High/Medium/Low]
- **Timeline**: [X weeks]
- **Owner**: [Role]

### Priority 2: [Recommendation]
...

## ROI Projection

| Scenario | Investment | Return | Timeline |
|----------|------------|--------|----------|
| OPTIMIZE | $[X] | $[X]/year | [X] months |
| REMOVE | $[X] | $[X] saved/year | [X] months |
| KEEP (as-is) | $0 | Current state | N/A |

## Implementation Roadmap (if OPTIMIZE)

| Phase | Timeline | Deliverables |
|-------|----------|--------------|
| Phase 1 | Weeks 1-2 | [Deliverables] |
| Phase 2 | Weeks 3-4 | [Deliverables] |
| Phase 3 | Weeks 5-6 | [Deliverables] |
```

---

## Data Appendix Template

```json
{
  "assessmentMetadata": {
    "org": "[org-alias]",
    "date": "[ISO date]",
    "framework": "CPQ Assessment Framework v2.0",
    "confidence": {
      "score": 0,
      "level": "HIGH|MEDIUM|LOW",
      "factors": []
    }
  },
  "discovery": {
    "cpqQuotes": {
      "total": 0,
      "recent6mo": 0,
      "latestDate": "[ISO date]",
      "pattern": "active|growing|stable|declining|abandoned"
    },
    "nativeQuotes": {
      "total": 0,
      "recent6mo": 0,
      "relationship": "PARALLEL_ACTIVE|MIGRATION_IN_PROGRESS|MIGRATION_COMPLETE|LEGACY_DOMINANT"
    }
  },
  "utilization": {
    "score": 0,
    "rating": "HIGH|MEDIUM|LOW",
    "subscriptions": {
      "total": 0,
      "contractLinked": 0,
      "linkageRate": 0
    },
    "opportunityAdoption": {
      "total": 0,
      "withCPQQuote": 0,
      "adoptionRate": 0
    }
  },
  "configuration": {
    "pricing": {
      "activePriceRules": 0,
      "priceActions": 0,
      "discountSchedules": 0,
      "complexityScore": 0,
      "complexityRating": "SIMPLE|MODERATE|COMPLEX"
    },
    "products": {
      "bundles": 0,
      "subscriptionEnabled": 0,
      "productOptions": 0,
      "productRules": 0
    },
    "catalogHealth": {
      "totalProducts": 0,
      "activeProducts": 0,
      "cpqProducts": 0,
      "healthScore": 0,
      "healthRating": "HEALTHY|MODERATE|NEEDS_ATTENTION"
    }
  },
  "recommendation": {
    "decision": "KEEP|OPTIMIZE|REMOVE",
    "weightedScore": 0,
    "topFindings": [],
    "priorities": []
  }
}
```

---

## Output File Naming

| File | Purpose | Format |
|------|---------|--------|
| `EXECUTIVE_SUMMARY.md` | BLUF+4 executive brief | Markdown |
| `PHASE_1_DISCOVERY.md` | Discovery findings | Markdown |
| `PHASE_2_UTILIZATION.md` | Utilization analysis | Markdown |
| `PHASE_3_CONFIGURATION.md` | Configuration review | Markdown |
| `PHASE_4_RECOMMENDATIONS.md` | Final recommendations | Markdown |
| `APPENDIX_DATA.json` | Raw metrics | JSON |
| `CPQ_ASSESSMENT_FULL.pdf` | Complete report | PDF |
