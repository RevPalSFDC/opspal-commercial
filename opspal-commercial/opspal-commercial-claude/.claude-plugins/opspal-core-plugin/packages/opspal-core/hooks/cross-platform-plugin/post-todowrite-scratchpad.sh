#!/usr/bin/env bash

# =============================================================================
# Post TodoWrite Scratchpad Hook
# ACE Framework - Persists TodoWrite state to scratchpad for session continuity
#
# Triggered: After TodoWrite tool is called (PostToolUse hook)
# Purpose: Save todo list progress to scratchpad for multi-session continuity
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
SESSION_ID="${CLAUDE_SESSION_ID:-}"
SCRATCHPAD_DIR="${CLAUDE_SCRATCHPAD_DIR:-}"

# Logging function
log() {
  local level="$1"
  shift
  if [[ "$VERBOSE" == "1" ]] || [[ "$level" == "ERROR" ]]; then
    echo "[PostTodoWriteScratchpad] [$level] $*" >&2
  fi
}

# Check if scratchpad is enabled
if [[ "$ENABLE_SCRATCHPAD" != "1" ]]; then
  exit 0
fi

# Load session environment if available
if [[ -f "${HOME}/.claude/session.env" ]]; then
  source "${HOME}/.claude/session.env" 2>/dev/null || true
fi

# Check if we have a session
if [[ -z "$SESSION_ID" ]] || [[ -z "$SCRATCHPAD_DIR" ]]; then
  log "INFO" "No active session - skipping todo persistence"
  exit 0
fi

# Check if scratchpad directory exists
if [[ ! -d "$SCRATCHPAD_DIR" ]]; then
  log "WARN" "Scratchpad directory not found: $SCRATCHPAD_DIR"
  exit 0
fi

# Read the tool input from stdin (PostToolUse hook receives tool result)
TOOL_INPUT=""
if [[ -p /dev/stdin ]]; then
  TOOL_INPUT=$(cat)
fi

# Main function
main() {
  log "INFO" "Post TodoWrite scratchpad hook executing"

  # Parse todos from input if available
  local todos_json=""

  if [[ -n "$TOOL_INPUT" ]]; then
    # Try to extract todos from the tool input
    todos_json=$(echo "$TOOL_INPUT" | grep -o '"todos":\s*\[.*\]' | head -1 || echo "")
  fi

  # If we couldn't extract todos from input, try to read from a known location
  # Claude Code stores current todos in memory, but we can track changes

  # Save current timestamp and any extracted todo data
  local progress_file="$SCRATCHPAD_DIR/progress.json"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Create or update progress tracking
  if [[ -n "$todos_json" ]]; then
    # We have todo data - save it
    node -e "
      const fs = require('fs');
      const progressFile = '$progress_file';
      const todosRaw = \`$todos_json\`.replace('\"todos\":', '');

      try {
        const todos = JSON.parse(todosRaw);

        const progress = {
          completed: todos.filter(t => t.status === 'completed').map(t => t.content),
          inProgress: todos.filter(t => t.status === 'in_progress').map(t => t.content),
          pending: todos.filter(t => t.status === 'pending').map(t => t.content),
          lastUpdated: '$timestamp'
        };

        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2), 'utf-8');
        console.log('Progress saved: ' + progress.completed.length + ' completed, ' +
                    progress.inProgress.length + ' in progress, ' +
                    progress.pending.length + ' pending');

      } catch (error) {
        console.error('Could not parse todos: ' + error.message);
      }
    " 2>/dev/null || log "WARN" "Could not save progress"

  else
    # No todo data in input - just update timestamp
    if [[ -f "$progress_file" ]]; then
      node -e "
        const fs = require('fs');
        const progressFile = '$progress_file';
        const progress = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
        progress.lastUpdated = '$timestamp';
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2), 'utf-8');
      " 2>/dev/null || true
    fi
  fi

  # Update state.json with latest activity
  local state_file="$SCRATCHPAD_DIR/state.json"
  if [[ -f "$state_file" ]]; then
    node -e "
      const fs = require('fs');
      const state = JSON.parse(fs.readFileSync('$state_file', 'utf-8'));
      state.metadata.lastActivity = '$timestamp';
      state.metadata.toolCalls = (state.metadata.toolCalls || 0) + 1;
      fs.writeFileSync('$state_file', JSON.stringify(state, null, 2), 'utf-8');
    " 2>/dev/null || true
  fi

  log "INFO" "Post TodoWrite scratchpad hook complete"
}

# Run main
main "$@"

exit 0
