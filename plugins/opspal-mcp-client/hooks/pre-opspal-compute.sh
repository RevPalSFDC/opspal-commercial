#!/usr/bin/env bash
# Pre-validation for OpsPal compute-heavy tools (revenue model, scenarios, market sizing).
# Validates required inputs before sending to server.
# Exit 0 = allow, Exit 2 = block with message on stderr.

set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[pre-opspal-compute] jq not found, skipping" >&2
    exit 0
fi

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty')

if [[ -z "$TOOL" ]]; then
  exit 0
fi

case "$TOOL" in
  mcp__opspal__compute_revenue_model)
    HAS_ARR=$(echo "$TOOL_INPUT" | jq 'has("baseArr")' 2>/dev/null || echo "false")
    if [[ "$HAS_ARR" != "true" ]]; then
      echo "OpsPal: compute_revenue_model requires 'baseArr' (current ARR in dollars). Also accepts: projectionYears, growthRate, nrr, churnRate, headcountPlan, monteCarloPasses." >&2
      exit 2
    fi
    # Warn on very high Monte Carlo passes (expensive computation)
    PASSES=$(echo "$TOOL_INPUT" | jq '.monteCarloPasses // 0' 2>/dev/null || echo "0")
    if [[ "$PASSES" -gt 10000 ]]; then
      echo "OpsPal: Warning - monteCarloPasses=$PASSES is very high. Consider <=5000 for faster results." >&2
    fi
    ;;
  mcp__opspal__run_scenario_planning)
    HAS_BASELINE=$(echo "$TOOL_INPUT" | jq 'has("baseline")' 2>/dev/null || echo "false")
    if [[ "$HAS_BASELINE" != "true" ]]; then
      echo "OpsPal: run_scenario_planning requires a 'baseline' object with arr, nrr, and newBookings." >&2
      exit 2
    fi
    ;;
  mcp__opspal__compute_market_sizing)
    HAS_METHOD=$(echo "$TOOL_INPUT" | jq 'has("method")' 2>/dev/null || echo "false")
    if [[ "$HAS_METHOD" != "true" ]]; then
      echo "OpsPal: compute_market_sizing requires 'method' (topDown or bottomUp) and 'inputs' object." >&2
      exit 2
    fi
    ;;
esac

exit 0
