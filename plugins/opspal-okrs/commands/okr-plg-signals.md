---
name: okr-plg-signals
description: Analyze PLG and hybrid-motion signals to produce benchmark-aware OKR guidance for product-sourced growth
argument-hint: "--org <org-slug> [--cycle <Q3-2026|H2-2026>] [--audience exec|product|revenue] [--format markdown|json]"
intent: Turn product funnel evidence into PLG and hybrid-motion OKR recommendations with explicit handoff and attribution framing.
dependencies: [opspal-okrs:okr-plg-specialist, opspal-core:product-analytics-bridge, optional CRM context]
failure_modes: [org_not_provided, product_analytics_unavailable, pql_definition_missing, attribution_split_undefined]
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - okr-plg
  - pql-signals
tags:
  - okr
  - plg
  - hybrid
---

# /okr-plg-signals Command

Analyze PLG and hybrid-motion performance for OKR planning. This command translates product usage, PQL, and monetization signals into benchmark-aware KRs and handoff guidance.

## Usage

```bash
# Review PLG signals for the current org
/okr-plg-signals --org acme-corp

# Generate a leadership-oriented hybrid-motion readout
/okr-plg-signals --org acme-corp --cycle Q4-2026 --audience exec

# Get machine-readable output for planning workflows
/okr-plg-signals --org acme-corp --format json
```

## What This Does

1. **Pulls product funnel evidence** from product analytics and supporting CRM context
2. **Benchmarks core PLG metrics** such as visitor-to-signup, activation, and paid conversion
3. **Separates motion ownership** across self-serve, sales-assisted, and sales-led paths
4. **Recommends KRs** that connect product behavior to revenue outcomes
5. **Flags handoff rules** so hybrid motion attribution is explicit

## Output

| Artifact | Location | Purpose |
|----------|----------|---------|
| PLG signals report | `orgs/{org}/platforms/okr/reports/okr-plg-signals-{date}.md` | Human-readable PLG and hybrid-motion analysis |
| PLG signals data | `orgs/{org}/platforms/okr/reports/okr-plg-signals-{date}.json` | Benchmark context, attribution split, and recommended KRs |

## Execution

This command invokes the `okr-plg-specialist` agent.

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-plg-specialist',
  prompt: `Analyze PLG OKR signals for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle || 'current or next planning cycle'}
    Audience: ${audience || 'exec'}
    Format: ${format || 'markdown'}

    Produce:
    1. Visitor->signup, activation, PQL, and paid conversion benchmark review
    2. Product-sourced vs sales-assisted vs sales-sourced attribution split
    3. Hybrid handoff trigger guidance
    4. Recommended PLG and hybrid-motion KRs`
});
```

## Related Commands

- `/okr-generate` - Build a draft OKR set using the resulting PLG guidance
- `/okr-benchmark` - Compare current metrics and targets against peer benchmarks
- `/okr-history` - Review whether PLG targets have historically landed
