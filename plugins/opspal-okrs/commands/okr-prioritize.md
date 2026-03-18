---
name: okr-prioritize
description: Rank an initiative backlog using the OKR scoring rubric, WSJF-style urgency, and capacity-aware cut lines
argument-hint: "--org <org-slug> --cycle <Q3-2026|H2-2026> --backlog <path> [--top <count>] [--capacity <initiative-count>] [--stage seed|series-a|series-b|series-c|growth|scale] [--gtm-model plg|slg|hybrid]"
intent: Turn a raw initiative backlog into a ranked, capacity-aware OKR portfolio recommendation.
dependencies: [opspal-okrs:okr-initiative-prioritizer, backlog_file_or_payload, config/initiative-scoring-rubric.json]
failure_modes: [backlog_missing, initiative_definition_incomplete, duplicate_upside_assumptions, capacity_line_missing]
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - prioritize-initiatives
  - okr-rank
tags:
  - okr
  - portfolio
  - prioritization
---

# /okr-prioritize Command

Rank a full initiative backlog for an OKR cycle. This command is for portfolio decisions, not one-off evaluation, and it produces a prioritized list with cut lines for what to fund now, later, or not at all.

## Usage

```bash
# Rank a backlog file for the upcoming cycle
/okr-prioritize --org acme-corp --cycle Q3-2026 --backlog ./initiative-backlog.json

# Focus on the top 10 initiatives only
/okr-prioritize --org acme-corp --cycle Q3-2026 --backlog ./initiative-backlog.json --top 10

# Add a realistic capacity line for planning review
/okr-prioritize --org acme-corp --cycle Q3-2026 --backlog ./initiative-backlog.json --capacity 6 --gtm-model hybrid
```

## What This Does

1. **Normalizes the backlog** into a comparable initiative list
2. **Scores every initiative** across the five-dimension OKR rubric
3. **Applies urgency logic** using time-cost-of-delay and timing sensitivity
4. **Adds stage and GTM modifiers** including hybrid-motion bonuses and funnel leverage
5. **Builds a ranked portfolio** with a top-line recommendation and capacity cut line

## Ranking Logic

| Step | Purpose |
|------|---------|
| Composite score | Measures strategic quality and expected business value |
| Timing urgency | Separates now from later when scores are close |
| Confidence notes | Flags weak evidence before approval |
| Capacity cut line | Shows what fits in the cycle versus what slips |

## Output

| Artifact | Location | Purpose |
|----------|----------|---------|
| Ranked backlog | `orgs/{org}/platforms/okr/{cycle}/reports/initiative-priority-stack.json` | Sorted initiative portfolio with rationale |
| Prioritization memo | `orgs/{org}/platforms/okr/{cycle}/reports/initiative-priority-stack.md` | Executive summary of rankings, tradeoffs, and cut line |

## Execution

This command invokes the `okr-initiative-prioritizer` agent.

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-initiative-prioritizer',
  prompt: `Prioritize this OKR initiative backlog for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Backlog file: ${backlog}
    Top N: ${top || 'all'}
    Capacity line: ${capacity || 'not specified'}
    Company stage: ${stage || 'infer from org context'}
    GTM model: ${gtmModel || 'infer from org context'}

    Produce:
    1. Ranked list with composite scores
    2. Must-Do, Should-Do, Nice-to-Have, and Deprioritize buckets
    3. Capacity-aware cut line
    4. Key tradeoffs and tie-breaker rationale`
});
```

## Review Questions

- Which initiatives directly unlock the most constrained funnel stage?
- Which high-score items are weak on evidence and need more validation?
- Which items fall below the capacity line but should stay warm for next cycle planning?

## Related Commands

- `/okr-score-initiative` - Score a single initiative in detail
- `/okr-approve` - Finalize the cycle after prioritization
- `/okr-report` - Turn the decision into an executive-ready summary
