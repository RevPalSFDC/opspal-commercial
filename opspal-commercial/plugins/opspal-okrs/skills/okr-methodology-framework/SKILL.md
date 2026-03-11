---
name: okr-methodology-framework
description: Core OKR writing discipline for revenue teams. Covers outcome-based Key Results, anti-pattern detection, data-sourced baselines, and stage-appropriate target setting. Use when generating OKRs, reviewing OKR quality, or coaching on OKR writing best practices.
allowed-tools: Read, Grep, Glob
---

# OKR Methodology Framework

## When to Use This Skill

- Generating OKRs from revenue data
- Reviewing OKR quality and catching anti-patterns
- Coaching on outcome-based Key Result writing
- Setting stage-appropriate targets
- Structuring objectives across revenue functions

## Core Principles

### 1. Outcomes Over Activities

Key Results must describe **what changes**, not **what you do**.

| Bad (Activity) | Good (Outcome) |
|----------------|-----------------|
| "Send 500 outbound emails per rep per month" | "Increase outbound-sourced pipeline from $1.2M to $2.0M" |
| "Conduct 20 QBRs with enterprise accounts" | "Improve enterprise NRR from 108% to 118%" |
| "Launch 3 new product features" | "Increase product-sourced PQLs from 50 to 150 per month" |
| "Hire 5 new AEs" | "Grow sales capacity to support $15M in quota coverage" |

### 2. Every KR Has a Real Baseline

No KR should be created without a verifiable starting point:

```json
{
  "baseline": {
    "value": 0.32,
    "measured_at": "2026-03-01T00:00:00Z",
    "source": "salesforce",
    "query_evidence": "SELECT COUNT(Id) FROM Opportunity WHERE IsWon = true AND CloseDate = LAST_N_DAYS:365 / SELECT COUNT(Id) FROM Opportunity WHERE IsClosed = true AND CloseDate = LAST_N_DAYS:365"
  }
}
```

If no baseline can be established from platform data, the KR must be flagged for manual input.

### 3. Three Stances for Every Target

Targets are never single-point. Each KR provides:
- **Conservative**: High confidence of achievement (70-80% probability)
- **Base**: Expected outcome with solid execution (50% probability)
- **Aggressive**: Stretch outcome requiring exceptional performance (20-30% probability)

### 4. Objectives Are Qualitative Aspirations

Good objectives are:
- **Inspirational**: They motivate the team
- **Directional**: They set a clear vector
- **Timeboxed**: They're achievable within the cycle
- **Owned**: They have a single functional owner

Format: `[Verb] [Outcome] [to/from] [Context]`

Examples:
- "Accelerate pipeline generation to support 35% ARR growth"
- "Establish world-class retention to reach 120% NRR"
- "Scale product-led growth to generate 30% of qualified pipeline"

## Anti-Pattern Detection

### KR Anti-Patterns

| Anti-Pattern | Detection Rule | Fix |
|-------------|---------------|-----|
| **Vanity metric** | Metric can grow without revenue impact | Link to revenue outcome |
| **Activity-based** | KR describes tasks, not outcomes | Rewrite as outcome |
| **Binary KR** | "Launch X" with no measurable scale | Add quantitative target |
| **Sandbagging** | Target below current baseline | Challenge with benchmark data |
| **Moonshot without data** | >3× improvement with no evidence | Calibrate with benchmarks |
| **Uncontrollable** | Team has no lever to influence outcome | Reassign or restructure |
| **Lagging-only** | Only outcome metrics, no leading indicators | Add leading KRs |

### Objective Anti-Patterns

| Anti-Pattern | Example | Fix |
|-------------|---------|-----|
| **Too many** | 7+ objectives | Consolidate to 3-5 |
| **Project-as-objective** | "Implement Salesforce CPQ" | Rewrite as outcome: "Reduce quote cycle time from 5 days to 1 day" |
| **Business-as-usual** | "Maintain current ARR" | Challenge: Is this aspirational? |
| **No owner** | Shared across 3 teams | Assign single functional owner |

## Stage-Appropriate Expectations

### By Company Stage

| Stage | Typical OKR Focus | ARR Growth Target Range | NRR Expectation |
|-------|-------------------|------------------------|-----------------|
| Seed | Product-market fit, first revenue | N/A | N/A |
| Series A | Repeatable sales, first GTM motion | 2-3× | >100% |
| Series B | Scaling GTM, multi-segment | 80-150% | >105% |
| Series C | Market expansion, efficiency | 50-80% | >110% |
| Growth | Category leadership, profitability | 30-50% | >115% |
| Scale | Market dominance, Rule of 40 | 15-30% | >120% |

### By GTM Model

| Model | Must-Have OKR Themes | Unique KRs |
|-------|---------------------|------------|
| PLG | Product activation, PQL conversion | Free-to-paid %, activation rate, time-to-value |
| SLG | Pipeline coverage, quota attainment | Sales cycle, win rate, ASP |
| Hybrid | Both above + handoff efficiency | PQL-to-SQL rate, product-sourced pipeline % |
| Channel | Partner enablement, co-sell | Partner-sourced pipeline, deal registration % |

## Cadence Guidance

| Cadence | Best For | Cycle Length |
|---------|----------|--------------|
| Quarterly OKRs | Series A-B, fast-moving teams | 13 weeks |
| Half-year OKRs | Series C+, longer sales cycles | 26 weeks |
| Annual objectives + quarterly KRs | Growth/Scale stage | Annual objectives, quarterly KR refresh |

## KR Weight Assignment

Within each objective, KR weights must sum to 1.0:
- **Primary KR** (the one metric that matters most): 0.4-0.5 weight
- **Supporting KRs**: 0.15-0.30 weight each
- **Leading indicator KRs**: 0.10-0.20 weight

Example for a Growth objective:
- "Increase ARR from $5M to $7M" — weight 0.45
- "Grow pipeline coverage from 3.2× to 4.0×" — weight 0.30
- "Improve win rate from 28% to 33%" — weight 0.25

## References

- OKR Schema: `config/okr-schema.json`
- KPI Catalog: `../../opspal-core/config/revops-kpi-definitions.json`
- Initiative Scoring: `config/initiative-scoring-rubric.json`
