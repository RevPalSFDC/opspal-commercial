#!/usr/bin/env bash
# Hook: post-task-gtm-telemetry.sh
# Event: PostToolUse (Agent matcher)
# Purpose: Capture GTM planning agent telemetry to gtm-telemetry.jsonl
# Pattern: mirrors opspal-okrs/hooks/post-task-okr-telemetry.sh

set -euo pipefail

# Skip if ORG_SLUG is not set
if [ -z "${ORG_SLUG:-}" ]; then
  printf '{}\n'
  exit 0
fi

# Read hook input from stdin
HOOK_INPUT=""
if [ ! -t 0 ]; then
  HOOK_INPUT=$(cat 2>/dev/null || true)
fi

# Extract agent name from environment or input
AGENT_NAME="${CLAUDE_AGENT_NAME:-}"
if [ -z "$AGENT_NAME" ] && [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
  AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // ""' 2>/dev/null || echo "")
fi

# Only track GTM planning agents
case "$AGENT_NAME" in
  *gtm-planning*|*gtm-strategy*|*gtm-territory*|*gtm-quota*|*gtm-comp*|*gtm-attribution*|*gtm-data*|*gtm-revenue*|*gtm-retention*|*gtm-market*|*gtm-strategic*|*forecast-orchestrator*)
    ;;
  *)
    printf '{}\n'
    exit 0
    ;;
esac

# Resolve telemetry directory
TELEMETRY_DIR="${CLAUDE_PROJECT_ROOT:-$(pwd)}/orgs/${ORG_SLUG}/platforms/gtm-planning"
mkdir -p "$TELEMETRY_DIR" 2>/dev/null || true

TELEMETRY_FILE="$TELEMETRY_DIR/gtm-telemetry.jsonl"

# Build telemetry record
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Fallback: read from shared state file if env vars are empty (O3 fix)
if [[ -z "${GTM_ACTIVE_CYCLE:-}" ]]; then
    _STATE="${HOME}/.claude/session-state/session-init-state.env"
    # shellcheck disable=SC1090
    [[ -f "$_STATE" ]] && source "$_STATE" 2>/dev/null || true
fi
CYCLE="${GTM_ACTIVE_CYCLE:-unknown}"
PHASE="${GTM_ACTIVE_PHASE:-unknown}"

# Extract metrics from Agent result if available
TOKEN_COUNT=""
DURATION_MS=""
TOOL_USES=""
if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
  TOKEN_COUNT=$(echo "$HOOK_INPUT" | jq -r '.token_count // ""' 2>/dev/null || echo "")
  DURATION_MS=$(echo "$HOOK_INPUT" | jq -r '.duration_ms // ""' 2>/dev/null || echo "")
  TOOL_USES=$(echo "$HOOK_INPUT" | jq -r '.tool_uses // ""' 2>/dev/null || echo "")
fi

# Write JSONL record
if command -v jq &>/dev/null; then
  jq -nc \
    --arg ts "$TIMESTAMP" \
    --arg agent "$AGENT_NAME" \
    --arg org "$ORG_SLUG" \
    --arg cycle "$CYCLE" \
    --arg phase "$PHASE" \
    --arg tokens "$TOKEN_COUNT" \
    --arg duration "$DURATION_MS" \
    --arg tools "$TOOL_USES" \
    '{
      timestamp: $ts,
      agent: $agent,
      org: $org,
      cycle: $cycle,
      phase: $phase,
      token_count: (if $tokens != "" then ($tokens | tonumber) else null end),
      duration_ms: (if $duration != "" then ($duration | tonumber) else null end),
      tool_uses: (if $tools != "" then ($tools | tonumber) else null end)
    }' >> "$TELEMETRY_FILE" 2>/dev/null || true
else
  echo "{\"timestamp\":\"$TIMESTAMP\",\"agent\":\"$AGENT_NAME\",\"org\":\"$ORG_SLUG\",\"cycle\":\"$CYCLE\",\"phase\":\"$PHASE\"}" >> "$TELEMETRY_FILE" 2>/dev/null || true
fi

printf '{}\n'
exit 0
