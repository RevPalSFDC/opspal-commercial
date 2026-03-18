---
name: opspal-compute
description: Run OpsPal proprietary compute operations — revenue models, scenario planning, market sizing
argument-hint: "<type> [options] — types: revenue-model, scenario, market-size, ramp, seasonality"
intent: Execute compute-heavy OpsPal analytical operations including Monte Carlo revenue modeling and scenario planning
dependencies: [mcp-compute-orchestrator]
failure_modes: [mcp_server_unavailable, api_budget_exceeded, invalid_parameters]
---

# OpsPal Compute Command

Run compute-heavy analytical operations using OpsPal proprietary algorithms.

## Usage

```
/opspal-compute revenue-model    # Multi-year ARR projection (Monte Carlo)
/opspal-compute scenario         # Base/upside/downside scenarios
/opspal-compute market-size      # TAM/SAM/SOM calculation
/opspal-compute ramp             # Rep ramp curves by role
/opspal-compute seasonality      # Quarterly/monthly seasonality
```

## Instructions

Route to the `opspal-mcp-client:mcp-compute-orchestrator` agent with the compute type and any provided options.

These operations use the Pro tier API. Check budget before proceeding.
