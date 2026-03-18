---
name: opspal-score
description: Run OpsPal proprietary scoring — customer health, churn risk, deal win probability, or lead quality
argument-hint: "<score-type> [options] — types: health, churn, deal, lead, compare"
intent: Execute proprietary scoring operations via OpsPal MCP server with budget-aware orchestration
dependencies: [mcp-scoring-orchestrator]
failure_modes: [mcp_server_unavailable, api_budget_exceeded, missing_signal_data]
---

# OpsPal Scoring Command

Run proprietary scoring operations using the OpsPal MCP server.

## Usage

```
/opspal-score health    # Customer health score (5-dimension)
/opspal-score churn     # Churn risk assessment
/opspal-score deal      # Deal win probability
/opspal-score lead      # Lead quality grade (A-F)
/opspal-score compare   # Smart entity comparison
/opspal-score all       # Full scoring suite for an account
```

## Instructions

Route to the `opspal-mcp-client:mcp-scoring-orchestrator` agent with the scoring type and any provided options. The orchestrator manages API budget, validates inputs, and produces BLUF+4 summaries.

If no score type is specified, show the usage help above and ask the user which scoring type they need.
