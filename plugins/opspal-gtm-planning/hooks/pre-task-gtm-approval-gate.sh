#!/usr/bin/env bash
# =============================================================================
# Pre-Task GTM Approval Gate Hook
# =============================================================================
#
# Purpose: Enforce the 7-phase GTM planning methodology by preventing agents
#          from executing phases out of order or without required gate approvals.
#
# Triggers: PreToolUse/Agent — for GTM planning agents
#
# Flow:
#   1. Read cycle-state.json for the active GTM cycle
#   2. Determine which phase the requested agent belongs to
#   3. Check if prerequisite phases are completed
#   4. Block if prerequisites not met; warn if gates pending approval
#
# Configuration:
#   GTM_APPROVAL_GATE_ENABLED=1      (default: enabled)
#   GTM_APPROVAL_GATE_STRICT=0       (default: warn-only; set 1 to block)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Configuration
ENABLED="${GTM_APPROVAL_GATE_ENABLED:-1}"
STRICT="${GTM_APPROVAL_GATE_STRICT:-0}"

if [[ "$ENABLED" != "1" ]]; then
  exit 0
fi

# Read hook input
HOOK_INPUT=""
if [ ! -t 0 ]; then
  HOOK_INPUT=$(cat)
fi

# Extract agent from input
AGENT_NAME=""
if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
  AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // ""' 2>/dev/null || echo "")
fi
AGENT_NAME="${AGENT_NAME:-${CLAUDE_AGENT_NAME:-}}"
AGENT_LOWER=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')

# Only apply to GTM planning agents
case "$AGENT_LOWER" in
  *gtm-planning*|*gtm-strategy*|*gtm-territory*|*gtm-quota*|*gtm-comp*|*gtm-attribution*|*gtm-data*|*gtm-revenue*|*gtm-retention*|*gtm-market*|*gtm-strategic*|*forecast-orchestrator*)
    ;;
  *)
    [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
    exit 0
    ;;
esac

# Require ORG_SLUG
if [[ -z "${ORG_SLUG:-}" ]]; then
  [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
  exit 0
fi

# Map agent to phase
get_agent_phase() {
  local agent="$1"
  case "$agent" in
    *gtm-data-insights*|*data-quality*)       echo "1" ;;
    *gtm-strategy-planner*|*gtm-market-intelligence*) echo "2" ;;
    *gtm-territory-designer*)                 echo "3" ;;
    *gtm-quota-capacity*|*forecast-orchestrator*) echo "4" ;;
    *gtm-comp-planner*)                       echo "5" ;;
    *gtm-attribution-governance*)             echo "6" ;;
    *gtm-planning-orchestrator*)              echo "7" ;;
    *gtm-revenue-modeler*|*gtm-retention-analyst*|*gtm-strategic-reports*) echo "0" ;; # Reports: no gate
    *)                                        echo "0" ;;
  esac
}

REQUIRED_PHASE=$(get_agent_phase "$AGENT_LOWER")

# Phase 0 = reporting/analytics agents, no gate needed
if [[ "$REQUIRED_PHASE" == "0" ]]; then
  [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
  exit 0
fi

# Find cycle state
GTM_BASE="${CLAUDE_PROJECT_ROOT:-$(pwd)}/orgs/${ORG_SLUG}/platforms/gtm-planning"
CYCLE_DIR="${GTM_ACTIVE_CYCLE:-}"
STATE_FILE=""

if [[ -n "$CYCLE_DIR" ]] && [[ -f "$GTM_BASE/$CYCLE_DIR/cycle-state.json" ]]; then
  STATE_FILE="$GTM_BASE/$CYCLE_DIR/cycle-state.json"
else
  # Find most recent cycle with state file
  for dir in "$GTM_BASE"/*/; do
    [[ -f "${dir}cycle-state.json" ]] && STATE_FILE="${dir}cycle-state.json"
  done
fi

# No state file = no enforcement (first run)
if [[ -z "$STATE_FILE" ]] || [[ ! -f "$STATE_FILE" ]]; then
  echo "[GTM-GATE] No cycle-state.json found — running without gate enforcement" >&2
  [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
  exit 0
fi

# Read phase states
if ! command -v jq &>/dev/null; then
  [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
  exit 0
fi

CURRENT_PHASE=$(jq -r '.current_phase // 0' "$STATE_FILE" 2>/dev/null || echo "0")

# Check if prerequisite phases are completed
PREREQ_PHASE=$((REQUIRED_PHASE - 1))
BLOCKED="false"
MISSING_GATES=""

if [[ "$PREREQ_PHASE" -ge 1 ]]; then
  for phase_num in $(seq 1 "$PREREQ_PHASE"); do
    PHASE_STATUS=$(jq -r ".phases[\"$phase_num\"].status // \"not_started\"" "$STATE_FILE" 2>/dev/null || echo "not_started")
    if [[ "$PHASE_STATUS" != "completed" ]] && [[ "$PHASE_STATUS" != "approved" ]]; then
      BLOCKED="true"
      MISSING_GATES="${MISSING_GATES}Phase ${phase_num} (${PHASE_STATUS}), "
    fi
  done
fi

if [[ "$BLOCKED" == "true" ]]; then
  MISSING_GATES="${MISSING_GATES%, }" # trim trailing comma

  if [[ "$STRICT" == "1" ]]; then
    echo "[GTM-GATE] BLOCKED: Agent ${AGENT_NAME} requires Phase ${REQUIRED_PHASE}, but prerequisite phases incomplete: ${MISSING_GATES}" >&2
    echo "[GTM-GATE] Complete and approve prerequisite phases before proceeding." >&2
    echo "[GTM-GATE] To override: export GTM_APPROVAL_GATE_STRICT=0" >&2
    [ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
    exit 2
  else
    echo "[GTM-GATE] WARNING: Agent ${AGENT_NAME} (Phase ${REQUIRED_PHASE}) invoked but prerequisite phases incomplete: ${MISSING_GATES}" >&2
    echo "[GTM-GATE] Consider completing prerequisite phases first for methodology compliance." >&2
  fi
fi

# Update current_phase in state file if advancing
if [[ "$REQUIRED_PHASE" -gt "$CURRENT_PHASE" ]] && [[ "$BLOCKED" != "true" ]]; then
  TMP_STATE=$(mktemp)
  jq --argjson phase "$REQUIRED_PHASE" '.current_phase = $phase' "$STATE_FILE" > "$TMP_STATE" 2>/dev/null && \
    mv "$TMP_STATE" "$STATE_FILE" || rm -f "$TMP_STATE"
fi

# Pass through
[ -n "$HOOK_INPUT" ] && echo "$HOOK_INPUT"
exit 0
