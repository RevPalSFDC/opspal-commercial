# OpsPal MCP Client - User Guide

Thin client plugin for the OpsPal proprietary IP server. Ships no IP — only MCP wiring and client-side hooks.

## What This Plugin Provides

1. **Resolver script** — Locates and launches the OpsPal MCP server (stdio mode)
2. **PreToolUse hooks** — Validate inputs before API calls to prevent wasted budget
3. **PostToolUse hook** — Track daily usage and warn at 80%/95% thresholds

## Setup

### Local Development (stdio)

Add to your project `.mcp.json`:

```json
{
  "opspal": {
    "command": "node",
    "args": ["plugins/opspal-mcp-client/scripts/mcp/resolve-opspal-mcp.js"],
    "env": {
      "OPSPAL_MCP_KEY": "dev_local_bypass"
    }
  }
}
```

### Remote / Client Deployment (HTTP)

```json
{
  "opspal": {
    "type": "streamable-http",
    "url": "https://mcp.revpal.io/mcp",
    "headers": {
      "OPSPAL-API-KEY": "${OPSPAL_MCP_KEY}"
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPSPAL_MCP_KEY` | Yes | API key or `dev_local_bypass` for local dev |
| `OPSPAL_MCP_PATH` | No | Override path to OpsPalMCP/index.js |
| `OPSPAL_TIER` | No | `free`, `pro`, or `ent` — used for usage warnings |

## Available Tools (27)

### System (Free)
- `ping` — Health check
- `list_capabilities` — Tool catalog with tier requirements

### Scoring (Pro)
- `score_customer_health` — 5-dimension health score (0-100)
- `score_churn_risk` — Churn risk with urgency multiplier
- `score_deal_win_probability` — Stage-aware win probability
- `score_lead_quality` — Fit + engagement grade (A-F)
- `run_smart_scorer` — Entity comparison with Bayesian scoring

### Benchmarks (Pro, except `get_kpi_definitions` free limited)
- `get_funnel_benchmarks` — Industry funnel metrics
- `get_retention_benchmarks` — NRR/GRR benchmarks by segment
- `get_gtm_benchmarks` — GTM metric baselines
- `get_kpi_definitions` — KPI definitions and formulas (10/day free)

### Assessment (Pro)
- `get_revops_framework` — RevOps scoring dimensions and rubrics
- `get_cpq_framework` — CPQ assessment phases and checkpoints
- `get_hubspot_framework` — HubSpot scoring components
- `get_data_quality_framework` — Field population thresholds, completeness scoring
- `get_enrichment_framework` — Waterfall provider order, mastering policy
- `get_marketo_framework` — Marketo scoring models, MQL thresholds
- `generate_bluf_summary` — BLUF executive summary generator

### GTM Planning (Pro)
- `compute_revenue_model` — Multi-year ARR projection with Monte Carlo
- `get_ramp_curves` — Rep ramp curves by role
- `get_seasonality_factors` — Quarterly/monthly seasonality
- `run_scenario_planning` — Base/upside/downside scenarios
- `compute_market_sizing` — TAM/SAM/SOM calculation

### Reporting (Pro, except `get_report_template` free limited)
- `get_kpi_matrix` — Persona-specific KPI matrix
- `get_decision_matrix` — Decision-context KPI mapping
- `get_domain_dictionary` — Industry term definitions
- `get_report_template` — Report template catalog (free) / full templates (pro)

## Hook Behavior

### PreToolUse: Input Validation

Scoring tools are validated for required signal objects. Compute tools are validated for required parameters. Invalid calls are **blocked** with a helpful error message — no API call is made.

### PostToolUse: Usage Tracking

Every `mcp__opspal__*` call increments a daily counter at `~/.claude/api-limits/opspal-daily.json`. Warnings appear at:
- **80%** — "Consider batching remaining calls"
- **95%** — "Remaining calls are limited"

Counter resets daily. Tier limits: free=50, pro=5,000, ent=50,000.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Could not find OpsPal MCP server" | Set `OPSPAL_MCP_PATH` or clone OpsPalMCP as sibling repo |
| "Missing dependencies" | Run `npm ci` in the OpsPalMCP directory |
| "Requires Professional tier" | Upgrade API key tier or use `dev_local_bypass` locally |
| Hooks not firing | Run `/pluginupdate --fix` to merge hooks into settings.json |
