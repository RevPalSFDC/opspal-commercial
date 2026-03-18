---
name: initiative-scoring-methodology
description: Five-dimension OKR initiative scoring method that combines stage-aware weighting, WSJF-style urgency, funnel leverage, and evidence quality. Use when scoring one initiative, ranking a backlog, or stress-testing which initiatives belong in the current cycle.
allowed-tools: Read, Grep, Glob
---

# Initiative Scoring Methodology

## When to Use This Skill

- Scoring a proposed initiative before it is added to an OKR plan
- Prioritizing a multi-team backlog into a cycle-ready cut line
- Comparing initiatives that compete for the same capacity
- Challenging weak rationales that rely on intuition instead of evidence

## Core Scoring Model

Each initiative is scored on five dimensions worth up to 20 points each:

| Dimension | What to Measure | Typical Signal Sources |
|-----------|-----------------|------------------------|
| Revenue Impact | Expected ARR, retention, or efficiency lift | Salesforce pipeline and forecast data, HubSpot deal flow, funnel diagnostics |
| Effort / Cost | Person-weeks, dependencies, technical complexity | Delivery estimate, dependency count, implementation path |
| Strategic Alignment | Fit to active objectives and board priorities | Approved OKRs, operating priorities, GTM motion |
| Timing Sensitivity | Why now matters more than later | Gong signals, renewal calendar, seasonality, market timing |
| Confidence / Data Quality | Strength of the evidence base | Live baselines, historical analogs, benchmarks, prior-cycle outcomes |

## Decision Sequence

1. **Anchor on the objective**. Do not score an initiative in isolation if its target objective is unclear.
2. **Collect evidence before opinion**. Pull baseline data, known constraints, and any prior result from similar work.
3. **Assign raw 0-20 scores** for each dimension.
4. **Apply context modifiers** for stage, GTM model, and funnel leverage.
5. **Use urgency as a tie-breaker**. If two initiatives are close, prefer the one with higher time-cost-of-delay.
6. **Bucket the outcome** into Must-Do, Should-Do, Nice-to-Have, or Deprioritize.

## Stage and GTM Modifiers

Use the scoring rubric in `config/initiative-scoring-rubric.json` as the source of truth for modifiers.

### Stage Effects

- Early-stage companies can justify smaller absolute revenue wins because the percentage impact is larger.
- Growth and scale companies should penalize weak evidence and low-efficiency work more heavily.
- Timing sensitivity matters more as competitive density and renewal exposure increase.

### GTM Model Effects

- `plg`: Reward product-led activation, adoption, and conversion levers.
- `slg`: Reward pipeline generation, win-rate, and enablement levers.
- `hybrid`: Add the largest bonus when one initiative improves the PLG to SLG handoff.

## Funnel Leverage Guidance

Revenue impact is not just about top-line size. It is also about where the initiative acts in the funnel.

| Funnel Pattern | Interpretation | Scoring Guidance |
|----------------|----------------|------------------|
| Constraint at top of funnel | More volume helps, but leakage downstream can dilute value | Raise score only if downstream conversion is healthy |
| Constraint in mid-funnel | Conversion bottlenecks often create compounding lift | Favor initiatives that unblock stage-to-stage movement |
| Constraint near close or renewal | Late-funnel and retention levers usually touch denser revenue | Treat as high leverage when the revenue base is material |

When funnel evidence exists, prefer data from the `sales-funnel-diagnostic` skill or equivalent agent outputs over qualitative claims.

## Timing Sensitivity Guidance

Timing is a real scoring dimension, not a rhetorical flourish. Increase timing sensitivity when any of the following are true:

- Gong signals show a rising competitor theme or repeated objection pattern
- A renewal window or pricing change makes delay materially expensive
- Seasonality changes the payback profile of acting this cycle versus next
- Regulatory, contractual, or board deadlines create a forced decision

Do not double-count timing by inflating revenue impact and timing sensitivity for the same reason.

## Confidence Rules

Use this evidence hierarchy:

1. **Live org data with query evidence**
2. **Prior-cycle outcomes or close analogs**
3. **Benchmarks adjusted for stage and GTM motion**
4. **Hypothesis only**

Weak evidence does not always kill an initiative, but it should lower the confidence score and change the recommendation from commit now to validate first.

## Thresholds

| Composite Score | Action |
|-----------------|--------|
| 75-100 | Must-Do |
| 50-74 | Should-Do |
| 25-49 | Nice-to-Have |
| 0-24 | Deprioritize |

## Common Failure Modes

- Scoring activity instead of business outcome
- Treating every initiative as urgent
- Ignoring stage modifiers and using one rubric for every company
- Overweighting revenue claims with no credible baseline
- Ranking by raw enthusiasm instead of by constrained capacity

## References

- Rubric: `config/initiative-scoring-rubric.json`
- OKR schema: `config/okr-schema.json`
- Funnel context: `../../opspal-core/skills/sales-funnel-diagnostic/SKILL.md`
