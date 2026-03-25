#!/usr/bin/env bash

# PostToolUse audit hook for Monday MCP calls.
# Classifies Monday tools as read or mutating and appends a JSONL audit record.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PROJECT_ROOT="${CLAUDE_PROJECT_ROOT:-$(cd "$PLUGIN_ROOT/../.." && pwd)}"

AUDIT_ENABLED="${MONDAY_MCP_AUDIT_ENABLED:-1}"

if [[ "$AUDIT_ENABLED" != "1" && "$AUDIT_ENABLED" != "true" ]]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

HOOK_INPUT=""
if [[ ! -t 0 ]]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

if [[ -z "$HOOK_INPUT" ]]; then
  exit 0
fi

TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // ""' 2>/dev/null || echo "")"
TOOL_NAME_LOWER="$(printf '%s' "$TOOL_NAME" | tr '[:upper:]' '[:lower:]')"

case "$TOOL_NAME_LOWER" in
  mcp__monday__*)
    ;;
  *)
    exit 0
    ;;
esac

CLASSIFICATION="unknown"
MUTATING="false"

case "$TOOL_NAME_LOWER" in
  *get*|*list*|*search*|*query*|*read*|*fetch*|*retrieve*|*view*|*describe*)
    CLASSIFICATION="read"
    ;;
  *create*|*change*|*update*|*delete*|*archive*|*move*|*add*|*remove*|*duplicate*|*copy*)
    CLASSIFICATION="write"
    MUTATING="true"
    ;;
esac

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LOG_DIR="${PROJECT_ROOT}/.claude/logs/hooks"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG_FILE="${LOG_DIR}/monday-mcp-audit-$(date +%Y-%m-%d).jsonl"

jq -nc \
  --arg timestamp "$TIMESTAMP" \
  --arg tool "$TOOL_NAME" \
  --arg classification "$CLASSIFICATION" \
  --arg mutating "$MUTATING" \
  --arg agent_type "$(printf '%s' "$HOOK_INPUT" | jq -r '.agent_type // ""' 2>/dev/null || echo "")" \
  --argjson tool_input "$(printf '%s' "$HOOK_INPUT" | jq -c '.tool_input // {}' 2>/dev/null || echo '{}')" \
  '{
    timestamp: $timestamp,
    tool_name: $tool,
    classification: $classification,
    mutating: ($mutating == "true"),
    agent_type: $agent_type,
    tool_input: $tool_input
  }' >> "$LOG_FILE" 2>/dev/null || true

if [[ "$MUTATING" == "true" ]]; then
  echo "Monday MCP audit: mutating operation ${TOOL_NAME} recorded." >&2
fi

exit 0
