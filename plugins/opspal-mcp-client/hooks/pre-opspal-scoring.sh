#!/usr/bin/env bash
# Pre-validation for OpsPal scoring tools.
# Checks that signal inputs are present before consuming an API call.
# Exit 0 = allow, Exit 2 = block with message on stderr.

set -euo pipefail

INPUT=$(cat /dev/stdin)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty')

# Skip if jq parse failed
if [[ -z "$TOOL" ]]; then
  exit 0
fi

case "$TOOL" in
  mcp__opspal__score_customer_health)
    HAS_SIGNALS=$(echo "$TOOL_INPUT" | jq 'has("signals")' 2>/dev/null || echo "false")
    if [[ "$HAS_SIGNALS" != "true" ]]; then
      echo "OpsPal: score_customer_health requires a 'signals' object with engagement, support, usage, payment, and nps scores (0-100 each)." >&2
      exit 2
    fi
    ;;
  mcp__opspal__score_churn_risk)
    HAS_SIGNALS=$(echo "$TOOL_INPUT" | jq 'has("signals")' 2>/dev/null || echo "false")
    if [[ "$HAS_SIGNALS" != "true" ]]; then
      echo "OpsPal: score_churn_risk requires a 'signals' object with engagementDecline, supportEscalations, usageDecline, paymentSignals, and competitiveSignals (0-100 each)." >&2
      exit 2
    fi
    ;;
  mcp__opspal__score_deal_win_probability)
    HAS_STAGE=$(echo "$TOOL_INPUT" | jq 'has("stage")' 2>/dev/null || echo "false")
    if [[ "$HAS_STAGE" != "true" ]]; then
      echo "OpsPal: score_deal_win_probability requires a 'stage' field (e.g., Discovery, Qualification, Proposal)." >&2
      exit 2
    fi
    ;;
  mcp__opspal__score_lead_quality)
    HAS_FIT=$(echo "$TOOL_INPUT" | jq 'has("fit")' 2>/dev/null || echo "false")
    HAS_ENGAGEMENT=$(echo "$TOOL_INPUT" | jq 'has("engagement")' 2>/dev/null || echo "false")
    if [[ "$HAS_FIT" != "true" || "$HAS_ENGAGEMENT" != "true" ]]; then
      echo "OpsPal: score_lead_quality requires both 'fit' (companySize, industry, geography, revenue) and 'engagement' (actions[]) objects." >&2
      exit 2
    fi
    ;;
  mcp__opspal__run_smart_scorer)
    HAS_A=$(echo "$TOOL_INPUT" | jq 'has("entityA")' 2>/dev/null || echo "false")
    HAS_B=$(echo "$TOOL_INPUT" | jq 'has("entityB")' 2>/dev/null || echo "false")
    if [[ "$HAS_A" != "true" || "$HAS_B" != "true" ]]; then
      echo "OpsPal: run_smart_scorer requires 'entityA' and 'entityB' objects for comparison." >&2
      exit 2
    fi
    ;;
esac

exit 0
