---
name: sales-funnel-diagnostic
description: Sales funnel diagnostic methodology with industry benchmarks and root cause analysis. Use when analyzing pipeline conversion rates, diagnosing funnel bottlenecks, benchmarking against industry standards, conducting TOFU/MOFU/BOFU analysis, or generating funnel optimization recommendations. Provides diagnostic workflows, benchmark data, and remediation patterns.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:unified-reporting-aggregator
---

# Sales Funnel Diagnostic

## When to Use This Skill

- Analyzing pipeline conversion rates
- Diagnosing funnel bottlenecks
- Benchmarking against industry standards
- Conducting TOFU/MOFU/BOFU analysis
- Identifying root causes of funnel issues
- Generating funnel optimization recommendations

## Quick Reference

### Funnel Stage Definitions

| Stage | Definition | Key Metrics |
|-------|------------|-------------|
| TOFU | Top of Funnel (Awareness) | Traffic, Leads, Connect Rate |
| MOFU | Middle of Funnel (Consideration) | MQLs, SQLs, Meeting Rate |
| BOFU | Bottom of Funnel (Decision) | Opportunities, Win Rate |

### Industry Benchmarks (B2B SaaS)

| Metric | Poor | Average | Good | Excellent |
|--------|------|---------|------|-----------|
| Connect Rate | <10% | 10-15% | 15-20% | >20% |
| Conversation→Meeting | <15% | 15-23% | 23-30% | >30% |
| Meeting→SQL | <40% | 40-55% | 55-70% | >70% |
| SQL→Opportunity | <60% | 60-75% | 75-85% | >85% |
| Win Rate | <15% | 15-25% | 25-35% | >35% |

### 6-Phase Diagnostic Workflow

1. **Data Collection** - Gather funnel metrics
2. **Stage Analysis** - Calculate conversion rates
3. **Benchmark Comparison** - Compare to standards
4. **Bottleneck Identification** - Find drop-offs
5. **Root Cause Analysis** - Determine why
6. **Recommendation Generation** - Propose fixes

## Detailed Documentation

See supporting files:
- `metrics-definitions.md` - Funnel metric definitions
- `benchmark-data.md` - Industry benchmarks
- `analysis-patterns.md` - Analysis methodology
- `remediation-guide.md` - Fix recommendations
