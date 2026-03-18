---
name: gtm-report
description: Generate strategic GTM reports from the template library
argument-hint: "<template-id> [--period Q1-2026] [--segments enterprise,mid-market] [--format pdf|excel|dashboard]"
---

# GTM Strategic Report Generator

Generate strategic GTM reports from the comprehensive template library.

## Usage

```
/gtm-report <template-id> [options]
```

## Available Templates

### Revenue Modeling
- `multi-year-revenue-model` - 3-5 year ARR projections
- `scenario-planning-model` - Upside/Base/Downside scenarios
- `arr-waterfall` - ARR movement analysis

### Retention & Growth
- `net-dollar-retention` - NRR/GRR cohort analysis
- `bookings-to-revenue-conversion` - Backlog tracking
- `revenue-mix-new-expansion-renewal` - Revenue source composition

### Market Intelligence
- `tam-sam-som` - Market opportunity sizing
- `revenue-by-segment` - Segment/industry/geo breakdown
- `icp-performance-win-profile` - ICP win rates and profiles
- `product-adoption-by-segment` - Feature adoption analysis

### Capacity Planning
- `sales-capacity-model` - Quota coverage and FRE
- `new-hire-ramp-model` - Rep ramp curves
- `customer-support-capacity-model` - CSM/support staffing

## Options

- `--period` - Time period for analysis (default: current quarter)
- `--segments` - Filter by customer segments (comma-separated)
- `--format` - Output format: pdf, excel, dashboard, csv (default: dashboard+pdf)
- `--data-source` - Data source: salesforce, hubspot, both (default: salesforce)

## Examples

```bash
# Generate ARR waterfall for current quarter
/gtm-report arr-waterfall

# Create multi-year revenue model with scenarios
/gtm-report multi-year-revenue-model --period 2026-2030

# Analyze retention by segment
/gtm-report net-dollar-retention --segments enterprise,mid-market --format pdf

# Generate market sizing report
/gtm-report tam-sam-som --format excel
```

## Workflow

1. **Template Selection** - Select report template from library
2. **Data Contract Validation** - Verify required fields exist
3. **Data Collection** - Query Salesforce/HubSpot via MCP
4. **Metric Calculation** - Apply template formulas
5. **Benchmark Comparison** - Add industry context
6. **Insight Generation** - AI-generated narrative
7. **Output Generation** - Render in requested format

## Output Files

- `{template-id}-report.{format}` - Primary report
- `{template-id}-data.json` - Raw calculated data
- `{template-id}-quality-validation.json` - Data quality results
- `{template-id}-insights.md` - AI-generated narratives

---

This command routes to the `gtm-strategic-reports-orchestrator` agent.
