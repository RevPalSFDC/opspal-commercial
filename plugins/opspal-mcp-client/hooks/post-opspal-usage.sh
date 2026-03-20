#!/usr/bin/env bash
# Post-call usage tracker for all OpsPal MCP tools.
# Tracks daily usage locally and warns when approaching limits.
# Outputs structured PostToolUse feedback to Claude via stdout.

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ -z "$TOOL" ]]; then
  exit 0
fi

emit_post_tool_use_context() {
  local context="$1"

  jq -nc --arg context "$context" '{
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $context
    }
  }'
}

# Usage tracking file (per day)
USAGE_DIR="${HOME}/.claude/api-limits"
mkdir -p "$USAGE_DIR"
TODAY=$(date +%Y-%m-%d)
USAGE_FILE="${USAGE_DIR}/opspal-daily.json"

# Initialize or load usage file
if [[ ! -f "$USAGE_FILE" ]] || [[ "$(jq -r '.date // empty' "$USAGE_FILE" 2>/dev/null)" != "$TODAY" ]]; then
  echo "{\"date\":\"$TODAY\",\"calls\":0,\"tools\":{}}" > "$USAGE_FILE"
fi

# Increment counters
CURRENT_CALLS=$(jq '.calls' "$USAGE_FILE" 2>/dev/null || echo "0")
TOOL_SHORT=$(echo "$TOOL" | sed 's/mcp__opspal__//')
TOOL_COUNT=$(jq -r ".tools[\"$TOOL_SHORT\"] // 0" "$USAGE_FILE" 2>/dev/null || echo "0")

NEW_CALLS=$((CURRENT_CALLS + 1))
NEW_TOOL_COUNT=$((TOOL_COUNT + 1))

# Update usage file atomically
TEMP_FILE=$(mktemp)
jq --argjson calls "$NEW_CALLS" \
   --arg tool "$TOOL_SHORT" \
   --argjson tcount "$NEW_TOOL_COUNT" \
   '.calls = $calls | .tools[$tool] = $tcount' \
   "$USAGE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$USAGE_FILE"

# Determine daily limit based on tier (default to free tier)
TIER="${OPSPAL_TIER:-free}"
case "$TIER" in
  ent)  DAILY_LIMIT=50000 ;;
  pro)  DAILY_LIMIT=5000 ;;
  *)    DAILY_LIMIT=50 ;;
esac

# Calculate usage percentage
USAGE_PCT=$(( (NEW_CALLS * 100) / DAILY_LIMIT ))

# Warn at thresholds
if [[ $USAGE_PCT -ge 95 ]]; then
  emit_post_tool_use_context "OpsPal CRITICAL: ${USAGE_PCT}% of daily budget used (${NEW_CALLS}/${DAILY_LIMIT}). Remaining calls are limited."
elif [[ $USAGE_PCT -ge 80 ]]; then
  emit_post_tool_use_context "OpsPal WARNING: ${USAGE_PCT}% of daily budget used (${NEW_CALLS}/${DAILY_LIMIT}). Consider batching remaining calls."
fi

exit 0
