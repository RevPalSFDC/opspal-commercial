#!/usr/bin/env bash
# STATUS: SUPERSEDED — absorbed by a registered dispatcher or consolidated hook

# =============================================================================
# Session Start Scratchpad Hook
# ACE Framework - Loads previous session context for multi-session continuity
#
# Triggered: On session start (SessionStart hook)
# Purpose: Find and load previous scratchpad context for current project
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
ENABLE_SCRATCHPAD="${ENABLE_SCRATCHPAD:-1}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Logging function
log() {
  local level="$1"
  shift
  if [[ "$VERBOSE" == "1" ]] || [[ "$level" == "ERROR" ]]; then
    echo "[SessionStartScratchpad] [$level] $*" >&2
  fi
}

# Check if scratchpad is enabled
if [[ "$ENABLE_SCRATCHPAD" != "1" ]]; then
  log "INFO" "Scratchpad disabled (ENABLE_SCRATCHPAD=0)"
  exit 0
fi

# Check for required tools
if ! command -v node &> /dev/null; then
  log "WARN" "node not installed - scratchpad loading skipped"
  exit 0
fi

SCRATCHPAD_MANAGER="$PLUGIN_ROOT/scripts/lib/scratchpad-manager.js"

if [[ ! -f "$SCRATCHPAD_MANAGER" ]]; then
  log "WARN" "scratchpad-manager.js not found"
  exit 0
fi

# Main function
main() {
  log "INFO" "Session start scratchpad hook executing"
  log "INFO" "Project directory: $PROJECT_DIR"

  # Find previous session for this project
  local previous_session
  previous_session=$(node "$SCRATCHPAD_MANAGER" find --project-dir "$PROJECT_DIR" --json 2>/dev/null || echo '{"found":false}')

  if [[ "$previous_session" == *'"found":false'* ]] || [[ -z "$previous_session" ]]; then
    log "INFO" "No previous session found - starting fresh"

    # Initialize new session
    local new_session
    new_session=$(node "$SCRATCHPAD_MANAGER" init --project-dir "$PROJECT_DIR" --json 2>/dev/null || echo '{}')

    if [[ "$new_session" != "{}" ]]; then
      local session_id
      session_id=$(echo "$new_session" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4 || echo "")

      if [[ -n "$session_id" ]]; then
        # Export session ID for other hooks/scripts
        echo "export CLAUDE_SESSION_ID='$session_id'" >> "${HOME}/.claude/session.env" 2>/dev/null || true
        log "INFO" "New session initialized: $session_id"
      fi
    fi

    exit 0
  fi

  # Parse previous session info
  local session_id
  session_id=$(echo "$previous_session" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4 || echo "")

  local iterations
  iterations=$(echo "$previous_session" | grep -o '"iterations":[0-9]*' | cut -d':' -f2 || echo "0")

  local plan_title
  plan_title=$(echo "$previous_session" | grep -o '"title":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

  log "INFO" "Found previous session: $session_id (iterations: $iterations)"

  # Check if there are open blockers
  local open_blockers
  open_blockers=$(echo "$previous_session" | grep -c '"status":"open"' || echo "0")

  # Build context message for Claude
  local context_message=""

  if [[ -n "$session_id" ]]; then
    context_message="📋 **Previous Session Context Available**\n"
    context_message+="- Session ID: \`$session_id\`\n"
    context_message+="- Previous iterations: $iterations\n"

    if [[ -n "$plan_title" ]]; then
      context_message+="- Task: $plan_title\n"
    fi

    if [[ "$open_blockers" -gt 0 ]]; then
      context_message+="- ⚠️ Open blockers: $open_blockers\n"
    fi

    context_message+="\nTo continue where you left off, I can load the previous session context."

    # Save context for injection
    SCRATCHPAD_DIR="${HOME}/.claude/scratchpad/$session_id"
    if [[ -d "$SCRATCHPAD_DIR" ]]; then
      # Export session info for use by other tools
      {
        echo "export CLAUDE_SESSION_ID='$session_id'"
        echo "export CLAUDE_SCRATCHPAD_DIR='$SCRATCHPAD_DIR'"
        echo "export CLAUDE_PREVIOUS_ITERATIONS='$iterations'"
      } > "${HOME}/.claude/session.env" 2>/dev/null || true

      log "INFO" "Session context exported to ~/.claude/session.env"
    fi
  fi

  # Output context as systemMessage for Claude
  if [[ -n "$context_message" ]]; then
    # Create JSON output using jq for proper escaping
    jq -nc \
      --arg msg "$context_message" \
      --arg sid "$session_id" \
      --argjson iters "${iterations:-0}" \
      --argjson blockers "${open_blockers:-0}" \
      --arg dir "${HOME}/.claude/scratchpad/$session_id" \
      '{systemMessage: $msg, metadata: {sessionId: $sid, previousIterations: $iters, openBlockers: $blockers, scratchpadDir: $dir}}' 2>/dev/null || echo "{}"
  fi

  log "INFO" "Session start scratchpad hook complete"
}

# Run main
main "$@"

exit 0
