---
name: okr-score-initiative
description: Score a proposed initiative against active OKRs using the five-dimension rubric, stage modifiers, and live GTM signals
argument-hint: "--org <org-slug> --cycle <Q3-2026|H2-2026> --initiative \"<summary>\" [--objective <objective-id>] [--stage seed|series-a|series-b|series-c|growth|scale] [--gtm-model plg|slg|hybrid]"
intent: Evaluate whether one proposed initiative deserves inclusion in the current or upcoming OKR cycle.
dependencies: [opspal-okrs:okr-initiative-evaluator, active_or_draft_cycle_context, config/initiative-scoring-rubric.json]
failure_modes: [initiative_summary_missing, cycle_context_missing, evidence_gap, confidence_band_too_wide]
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - score-initiative
  - okr-score
tags:
  - okr
  - initiatives
  - prioritization
---

# /okr-score-initiative Command

Score a single proposed initiative before it enters an OKR plan. This command produces a structured scorecard with a 0-100 composite score, evidence notes, and a recommendation for include, revise, or defer.

## Usage

```bash
# Score a single initiative against an active cycle
/okr-score-initiative --org acme-corp --cycle Q3-2026 --initiative "Launch enterprise expansion plays for top 25 accounts"

# Force company context when the evaluator needs stage-specific modifiers
/okr-score-initiative --org acme-corp --cycle Q3-2026 --stage series-b --gtm-model hybrid --initiative "Reduce time-to-first-value for trial users"

# Tie the initiative to a specific objective for alignment scoring
/okr-score-initiative --org acme-corp --cycle Q3-2026 --objective OBJ-002 --initiative "Stand up renewal risk alerts in Gong and Salesforce"
```

## What This Does

1. **Loads context** from the active or draft OKR set for the selected cycle
2. **Collects evidence** from baseline data, funnel diagnostics, and competitive timing signals
3. **Scores five dimensions**: Revenue Impact, Effort/Cost, Strategic Alignment, Timing Sensitivity, Confidence/Data Quality
4. **Applies modifiers** for company stage, GTM motion, funnel leverage, and urgency signals
5. **Returns a recommendation** with rationale, confidence notes, and suggested next step

## Scoring Dimensions

| Dimension | Weight | What It Checks |
|-----------|--------|----------------|
| Revenue Impact | 20 | ARR or efficiency lift, including funnel leverage |
| Effort / Cost | 20 | Person-weeks, complexity, dependencies |
| Strategic Alignment | 20 | Match to active objectives and board priorities |
| Timing Sensitivity | 20 | Competitive urgency, renewals, seasonality, market window |
| Confidence / Data Quality | 20 | Strength of evidence and benchmark coverage |

## Output

| Artifact | Location | Purpose |
|----------|----------|---------|
| Initiative scorecard | `orgs/{org}/platforms/okr/{cycle}/reports/initiative-scorecard-{timestamp}.md` | Human-readable scoring summary |
| Initiative score JSON | `orgs/{org}/platforms/okr/{cycle}/reports/initiative-scorecard-{timestamp}.json` | Machine-readable breakdown and recommendation |

## Execution

This command invokes the `okr-initiative-evaluator` agent.

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-initiative-evaluator',
  prompt: `Score this initiative for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Initiative: ${initiative}
    Objective: ${objective || 'auto-detect best fit'}
    Company stage: ${stage || 'infer from org context'}
    GTM model: ${gtmModel || 'infer from org context'}

    Produce:
    1. Five-dimension scorecard with 0-20 scores
    2. Stage and GTM modifier notes
    3. Funnel leverage and timing-signal rationale
    4. Composite score, threshold band, and recommendation`
});
```

## Recommendations

| Composite Score | Recommendation |
|-----------------|----------------|
| 75-100 | Must-Do |
| 50-74 | Should-Do |
| 25-49 | Nice-to-Have |
| 0-24 | Deprioritize |

## Related Commands

- `/okr-prioritize` - Rank a full initiative backlog
- `/okr-approve` - Approve a draft OKR set for activation
- `/okr-status` - Check active OKR health after initiatives launch
