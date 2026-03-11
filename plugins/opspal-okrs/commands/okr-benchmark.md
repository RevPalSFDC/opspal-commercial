---
name: okr-benchmark
description: Compare OKR targets and initiative assumptions against stage-aware peer benchmarks before committing to a plan
argument-hint: "--org <org-slug> [--cycle <Q3-2026|H2-2026>] [--focus growth|retention|efficiency|plg] [--format markdown|json]"
intent: Stress-test OKR targets and initiative assumptions against relevant peer benchmarks and current company context.
dependencies: [opspal-okrs:okr-initiative-evaluator, opspal-salesforce:benchmark-research-agent, ../../opspal-core/config/revops-kpi-definitions.json]
failure_modes: [org_not_provided, target_context_missing, benchmark_segment_missing, benchmark_used_as_baseline]
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - benchmark-okrs
  - okr-compare
tags:
  - okr
  - benchmark
  - planning
---

# /okr-benchmark Command

Benchmark OKR targets or initiative assumptions against peer data adjusted for stage, GTM model, and momentum. This command is for calibration before approval, not a replacement for org baselines.

## Usage

```bash
# Benchmark the next cycle across all major themes
/okr-benchmark --org acme-corp --cycle Q4-2026

# Focus on PLG benchmarks only
/okr-benchmark --org acme-corp --focus plg

# Export benchmark analysis as JSON
/okr-benchmark --org acme-corp --cycle Q4-2026 --format json
```

## What This Does

1. **Reads current OKR context** or target proposals for the selected scope
2. **Pulls benchmark context** from canonical KPI definitions and benchmark research
3. **Adjusts the comparison** for stage, GTM model, and momentum
4. **Flags over-stretched or sandbagged targets**
5. **Returns calibration guidance** for whether to hold, lower, or raise the target posture

## Output

| Artifact | Location | Purpose |
|----------|----------|---------|
| Benchmark memo | `orgs/{org}/platforms/okr/reports/okr-benchmark-{date}.md` | Narrative benchmark comparison and recommendation |
| Benchmark data | `orgs/{org}/platforms/okr/reports/okr-benchmark-{date}.json` | Benchmark inputs, peer ranges, and target calibration |

## Execution

This command invokes the `okr-initiative-evaluator` agent and requires benchmark context.

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-initiative-evaluator',
  prompt: `Benchmark OKR planning context for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle || 'current planning cycle'}
    Focus: ${focus || 'all'}
    Format: ${format || 'markdown'}

    Coordinate with benchmark-research-agent and produce:
    1. Relevant peer benchmark ranges
    2. Stage- and GTM-adjusted comparison
    3. Overstretch and sandbagging flags
    4. Target calibration guidance`
});
```

## Related Commands

- `/okr-score-initiative` - Evaluate one initiative with the benchmark context applied
- `/okr-prioritize` - Rank the backlog after target assumptions are calibrated
- `/okr-plg-signals` - Use when the benchmark question is specifically product-led
