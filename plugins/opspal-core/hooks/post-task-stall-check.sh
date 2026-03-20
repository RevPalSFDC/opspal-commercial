#!/usr/bin/env bash

# =============================================================================
# Post Task Stall Check Hook
# ACE Framework - Monitors progress after Agent tool invocations
#
# Triggered: After Agent tool completes (PostToolUse hook)
# Purpose: Check for stalls during complex multi-agent operations
#
# Version: 1.0.0
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"

# Source error handler if available
if [[ -f "$PLUGIN_ROOT/hooks/lib/error-handler.sh" ]]; then
  source "$PLUGIN_ROOT/hooks/lib/error-handler.sh"
fi

# Configuration
VERBOSE="${ROUTING_VERBOSE:-0}"
ENABLE_STALL_DETECTION="${ENABLE_STALL_DETECTION:-1}"
STALL_THRESHOLD="${STALL_THRESHOLD:-3}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Logging function
log() {
  local level="$1"
  shift
  if [[ "$VERBOSE" == "1" ]] || [[ "$level" == "ERROR" ]]; then
    echo "[PostTaskStallCheck] [$level] $*" >&2
  fi
}

# Check if stall detection is enabled
if [[ "$ENABLE_STALL_DETECTION" != "1" ]]; then
  exit 0
fi

# Check if progress monitor exists
PROGRESS_MONITOR="$PLUGIN_ROOT/scripts/lib/progress-monitor.js"

if [[ ! -f "$PROGRESS_MONITOR" ]]; then
  log "WARN" "progress-monitor.js not found - skipping stall check"
  exit 0
fi

# Check for required tools
if ! command -v node &> /dev/null; then
  log "WARN" "node not installed - stall detection skipped"
  exit 0
fi

# Read tool input from stdin
TOOL_INPUT=""
if [[ -p /dev/stdin ]]; then
  TOOL_INPUT=$(cat)
fi

# Main function
main() {
  log "INFO" "Post Task stall check executing"

  # Run progress check
  local check_result
  check_result=$(node "$PROGRESS_MONITOR" check \
    --project-dir "$PROJECT_DIR" \
    --threshold "$STALL_THRESHOLD" \
    --json 2>/dev/null) || {
    log "WARN" "Progress check failed"
    exit 0
  }

  # Parse result
  local stall_count
  local intervention_needed

  stall_count=$(echo "$check_result" | grep -o '"stallCount":[0-9]*' | cut -d':' -f2 || echo "0")
  intervention_needed=$(echo "$check_result" | grep -o '"needed":true' || echo "")

  log "INFO" "Stall count: $stall_count"

  # Check if intervention is needed
  if [[ -n "$intervention_needed" ]]; then
    # Output warning message
    cat <<EOF
{
  "systemMessage": "⚠️ **STALL DETECTED**\\n\\nNo meaningful progress detected after $stall_count iterations.\\n\\n**Suggestions:**\\n- Review the current approach - it may need adjustment\\n- Check for blockers or missing dependencies\\n- Consider breaking down the task into smaller steps\\n- Ask for clarification if requirements are unclear\\n\\n*Progress monitoring will reset after user provides input.*",
  "severity": "warning",
  "metadata": {
    "stallCount": $stall_count,
    "threshold": $STALL_THRESHOLD,
    "action": "intervention_requested"
  }
}
EOF
    log "INFO" "Stall intervention triggered"
  fi

  log "INFO" "Post Task stall check complete"
}

# Run main
main "$@"

exit 0
