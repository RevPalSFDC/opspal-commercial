# Team Template: Assessment + Benchmarks

> **BLOCKED: Requires Agent Teams GA**

## Team Purpose

Run any assessment agent alongside the benchmark research agent, so industry benchmarks are fetched in parallel as metrics are discovered. Eliminates the current pattern of running the assessment first, then calling the benchmark agent for each metric separately.

## Team Structure

```
Team Lead: assessment-benchmark-coordinator
├── Teammate 1: {assessment-agent} (model: varies)
└── Teammate 2: benchmark-research-agent (model: opus)
```

### Roles

| Agent | Role | Display Mode |
|-------|------|-------------|
| `assessment-benchmark-coordinator` | Orchestrates team, merges assessment with benchmarks | `delegate` |
| `{assessment-agent}` | Any assessor (CPQ, RevOps, automation, etc.) | `full` |
| `benchmark-research-agent` | Fetches industry benchmarks for each discovered metric | `full` |

### Communication Pattern

```
assessment-agent ──SendMessage──> benchmark-research-agent
  "Found win rate: 23%. Industry: SaaS. ACV: $50K. Get benchmark."

benchmark-research-agent ──SendMessage──> assessment-agent
  "SaaS benchmark for $50K ACV: 18-25% win rate. Client is at median."

assessment-agent uses benchmark in final report scoring.
```

## Compatible Assessment Agents

This template works with any of these assessors:

| Assessment Agent | Typical Metrics Benchmarked |
|-----------------|---------------------------|
| `sfdc-revops-auditor` | Win rate, cycle time, pipeline coverage, forecast accuracy |
| `sfdc-cpq-assessor` | Discount depth, quote cycle time, approval bottlenecks |
| `sfdc-automation-auditor` | Flow count, automation coverage, error rates |
| `hubspot-assessment-analyzer` | Email engagement, workflow adoption, lifecycle velocity |
| `marketo-analytics-assessor` | Program ROI, MQL conversion, deliverability |

## Expected Benefits

- **Time**: ~30% reduction (benchmarks fetched in parallel)
- **Quality**: Every metric gets a benchmark comparison (currently some are skipped for time)
- **Cost**: ~2x token cost (only 2 agents)

## Sequential Equivalent (Current)

```
1. Task(sfdc-revops-auditor, "Run RevOps audit for {org}")
2. For each metric in findings:
     Task(benchmark-research-agent, "Get benchmark for {metric}")
3. Manually merge benchmarks into report
```

## When to Use

- Any client assessment where benchmarking adds value
- Lowest cost team template (only 2 agents)
- When the client expects industry comparisons in the deliverable
