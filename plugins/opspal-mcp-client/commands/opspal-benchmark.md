---
name: opspal-benchmark
description: Retrieve industry benchmarks from OpsPal proprietary database — funnel, retention, GTM, and KPI definitions
argument-hint: "<type> [segment] — types: funnel, retention, gtm, kpi"
intent: Retrieve verified industry benchmarks and KPI definitions from OpsPal proprietary tools
dependencies: [mcp-benchmark-agent]
failure_modes: [mcp_server_unavailable, api_budget_exceeded]
---

# OpsPal Benchmark Command

Retrieve verified industry benchmarks from the OpsPal proprietary database.

## Usage

```
/opspal-benchmark funnel              # Funnel conversion benchmarks
/opspal-benchmark retention           # NRR/GRR retention benchmarks
/opspal-benchmark gtm                 # GTM metric baselines
/opspal-benchmark kpi <metric-name>   # KPI definition and formula
/opspal-benchmark all                 # Full benchmark suite
```

## Instructions

Route to the `opspal-mcp-client:mcp-benchmark-agent` agent with the benchmark type and optional segment filters.

If comparing against actual metrics, also show the gap analysis and percentile interpretation.
