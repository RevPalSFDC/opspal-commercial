#!/usr/bin/env bash
# Hook: post-task-okr-telemetry.sh
# Event: PostToolUse on Agent
# Purpose: Capture OKR agent telemetry (token_count, duration_ms, tool_uses)
# Writes JSONL to ~/.claude/logs/okr-telemetry.jsonl
# Never blocks on failure

set -euo pipefail

# Read tool output from stdin
INPUT="$(cat 2>/dev/null || true)"

# Only process OKR agent results
IS_OKR=""
if command -v jq &>/dev/null; then
  AGENT_TYPE="$(echo "$INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // empty' 2>/dev/null || true)"
  case "$AGENT_TYPE" in
    *okr*|*opspal-okrs*)
      IS_OKR="1"
      ;;
  esac
fi

if [ -z "$IS_OKR" ]; then
  exit 0
fi

# Extract metrics
TOKEN_COUNT="$(echo "$INPUT" | jq -r '.token_count // 0' 2>/dev/null || echo 0)"
DURATION_MS="$(echo "$INPUT" | jq -r '.duration_ms // 0' 2>/dev/null || echo 0)"
TOOL_USES="$(echo "$INPUT" | jq -r '.tool_uses // 0' 2>/dev/null || echo 0)"

# Ensure log directory exists
LOG_DIR="${HOME}/.claude/logs"
mkdir -p "$LOG_DIR" 2>/dev/null || true

LOG_FILE="${LOG_DIR}/okr-telemetry.jsonl"

# Write telemetry entry (never block on failure)
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown")"
ORG="${ORG_SLUG:-unknown}"

if command -v jq &>/dev/null; then
  jq -nc \
    --arg ts "$TIMESTAMP" \
    --arg agent "$AGENT_TYPE" \
    --arg org "$ORG" \
    --argjson tokens "$TOKEN_COUNT" \
    --argjson duration "$DURATION_MS" \
    --argjson tools "$TOOL_USES" \
    '{timestamp: $ts, agent: $agent, org: $org, token_count: $tokens, duration_ms: $duration, tool_uses: $tools}' \
    >> "$LOG_FILE" 2>/dev/null || true
else
  echo "{\"timestamp\":\"$TIMESTAMP\",\"agent\":\"$AGENT_TYPE\",\"org\":\"$ORG\",\"token_count\":$TOKEN_COUNT,\"duration_ms\":$DURATION_MS,\"tool_uses\":$TOOL_USES}" \
    >> "$LOG_FILE" 2>/dev/null || true
fi

exit 0
