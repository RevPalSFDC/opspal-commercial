---
name: cpq-assessment
description: Salesforce CPQ assessment methodology. Use when evaluating CPQ configuration, pricing rules, product bundles, discount schedules, or quote templates. Provides structured audit framework with data quality protocols and error taxonomy for keep/optimize/remove recommendations.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-cpq-assessor
context:
  fork: true
  checkpoint: phase-completion
  state-keys:
    - org-alias
    - discovered-objects
    - utilization-scores
    - configuration-findings
    - time-series-patterns
---

# CPQ Assessment Framework

## When to Use This Skill

Activate this skill when the user:
- Mentions "CPQ assessment", "pricing audit", or "quote configuration review"
- Asks about SBQQ__* objects or Salesforce CPQ metadata
- Needs to evaluate discount schedules, product rules, or price rules
- Wants keep/optimize/remove recommendations for CPQ
- Asks about CPQ utilization or ROI analysis

## Core Assessment Phases

The CPQ assessment follows a 5-phase methodology:

### Phase 0: Pre-Flight (MANDATORY)
- Verify CPQ package installation
- Confirm org connection active
- Check CPQ objects accessible
- Validate Native Quote object (warning only)

### Phase 1: Discovery with Time-Series
- Total vs recent record counts
- Time-series pattern (active/declining/abandoned)
- Latest record date validation
- Dual-system relationship analysis

### Phase 2: Utilization Analysis
- Subscription metrics and contract linkage
- Opportunity quote adoption rates
- Distinguish historical vs recent metrics

### Phase 3: Configuration Review
- Pricing automation (price rules, product rules, discount schedules)
- Product configuration (bundles, subscription products)
- Reporting analysis for CPQ data usage

### Phase 4: Recommendations
- Active vs historical issues
- Utilization thresholds for keep/optimize/remove
- Confidence levels and transparency
- Business case documentation

### Phase 5: Deliverables
- Executive summary
- Detailed findings report
- Recommendations with prioritization

## Key Decision Thresholds

### Utilization Score Thresholds
| Score | Rating | Recommendation |
|-------|--------|----------------|
| < 20% | LOW | REMOVE |
| 20-50% | MEDIUM | OPTIMIZE |
| > 50% | HIGH | KEEP |

### Pricing Complexity Thresholds
| Score | Rating | Action |
|-------|--------|--------|
| < 20 | SIMPLE | Minor cleanup |
| 20-50 | MODERATE | Review for consolidation |
| > 100 | COMPLEX | Major simplification needed |

## Data Quality Requirements

Before drawing ANY conclusion:
1. Run data quality checkpoint
2. Validate time-series patterns
3. Cross-validate with user observations
4. Never conclude from NULL/missing data without confirmation

## Reference Documentation

For detailed methodology, see:
- `methodology.md` - Complete phase-by-phase guide
- `data-quality-protocol.md` - Data validation requirements
- `error-taxonomy.md` - Common errors and fixes
- `report-templates.md` - Output format templates
