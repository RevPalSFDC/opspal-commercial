---
description: ARR waterfall and pipeline coverage report for Attio
argument-hint: "[--list slug] [--period Q1|Q2|Q3|Q4|YTD] [--target amount]"
---

# /attio-revenue-report

Revenue intelligence report for Attio workspaces. Generates ARR waterfall analysis, pipeline coverage ratios, and win/loss breakdowns for the current period.

## Usage

```
/attio-revenue-report [--list slug] [--period Q1|Q2|Q3|Q4|YTD] [--target amount]
```

## What It Does

**ARR Waterfall** — Breaks revenue movement into components:
- New ARR (new logos closed in period)
- Expansion ARR (upsells and cross-sells)
- Contraction ARR (downgrades)
- Churned ARR (lost customers)
- Net New ARR (sum of all movements)

**Pipeline Coverage** — Evaluates pipeline health against target:
- Coverage ratio = total open pipeline / period target
- Healthy range: 3x–4x coverage
- Flags under-coverage (<3x) and over-reliance on late-stage deals

**Weighted Pipeline** — Applies stage probability to open deals:
- Weighted value = deal value × stage win probability
- Compares weighted pipeline to target for realistic forecasting

**Win/Loss Analysis** — Period performance metrics:
- Win rate by deal count and by value
- Average sales cycle length
- Loss reason breakdown (where captured)

**Cohort Breakdown** — Segments results by a configurable attribute:
- Default cohort: deal owner
- Override with `--cohort` attribute slug (e.g., `--cohort industry`, `--cohort region`)

## Defaults

- Period: current calendar quarter
- Pipelines: all deal pipelines in the workspace
- List: all lists of object type `deals`

## Examples

```
/attio-revenue-report
/attio-revenue-report --period YTD --target 2000000
/attio-revenue-report --list enterprise-deals --period Q2 --target 500000
```

## Delegation

Delegates to the **attio-revenue-intelligence** agent for data retrieval, calculation, and formatted output.
