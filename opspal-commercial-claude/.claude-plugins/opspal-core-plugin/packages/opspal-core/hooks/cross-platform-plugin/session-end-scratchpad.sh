#!/usr/bin/env bash

# =============================================================================
# Session End Scratchpad Hook
# ACE Framework - Saves session state for multi-session continuity
#
# Triggered: On session end (Stop hook)
# Purpose: Save scratchpad state, extract skills used, cleanup old sessions
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
    echo "[SessionEndScratchpad] [$level] $*" >&2
  fi
}

# Check if scratchpad is enabled
if [[ "$ENABLE_SCRATCHPAD" != "1" ]]; then
  log "INFO" "Scratchpad disabled (ENABLE_SCRATCHPAD=0)"
  exit 0
fi

# Check for required tools
if ! command -v node &> /dev/null; then
  log "WARN" "node not installed - scratchpad saving skipped"
  exit 0
fi

SCRATCHPAD_MANAGER="$PLUGIN_ROOT/scripts/lib/scratchpad-manager.js"

if [[ ! -f "$SCRATCHPAD_MANAGER" ]]; then
  log "WARN" "scratchpad-manager.js not found"
  exit 0
fi

# Load session environment if available
if [[ -f "${HOME}/.claude/session.env" ]]; then
  source "${HOME}/.claude/session.env" 2>/dev/null || true
fi

# Main function
main() {
  log "INFO" "Session end scratchpad hook executing"

  # Check if we have a session to save
  if [[ -z "$SESSION_ID" ]]; then
    log "INFO" "No session ID - nothing to save"
    exit 0
  fi

  log "INFO" "Saving session: $SESSION_ID"

  # Update session state with final iteration
  if [[ -n "$SCRATCHPAD_DIR" ]] && [[ -d "$SCRATCHPAD_DIR" ]]; then
    local state_file="$SCRATCHPAD_DIR/state.json"

    if [[ -f "$state_file" ]]; then
      # Update last activity timestamp using node
      node -e "
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$state_file', 'utf-8'));
        state.updatedAt = new Date().toISOString();
        state.metadata.lastActivity = new Date().toISOString();
        fs.writeFileSync('$state_file', JSON.stringify(state, null, 2), 'utf-8');
        console.log('State updated');
      " 2>/dev/null || log "WARN" "Could not update state timestamp"
    fi
  fi

  # Clean up old scratchpads
  log "INFO" "Cleaning up old scratchpads..."
  local cleanup_result
  cleanup_result=$(node "$SCRATCHPAD_MANAGER" cleanup --json 2>/dev/null || echo '{"deleted":0}')

  local deleted
  deleted=$(echo "$cleanup_result" | grep -o '"deleted":[0-9]*' | cut -d':' -f2 || echo "0")

  if [[ "$deleted" -gt 0 ]]; then
    log "INFO" "Cleaned up $deleted old scratchpad(s)"
  fi

  # Generate session summary
  log "INFO" "Generating session summary..."

  if [[ -n "$SCRATCHPAD_DIR" ]] && [[ -d "$SCRATCHPAD_DIR" ]]; then
    # Create session end summary
    local summary_file="$SCRATCHPAD_DIR/SESSION_END_SUMMARY.md"

    {
      echo "# Session End Summary"
      echo ""
      echo "**Session ID:** $SESSION_ID"
      echo "**Ended:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      echo ""

      # Include plan progress if available
      if [[ -f "$SCRATCHPAD_DIR/plan.md" ]]; then
        echo "## Plan Status"
        echo ""
        grep -E "^(✅|🔄|⬜)" "$SCRATCHPAD_DIR/plan.md" 2>/dev/null || echo "_No plan steps recorded_"
        echo ""
      fi

      # Include open blockers if any
      if [[ -f "$SCRATCHPAD_DIR/blockers.md" ]]; then
        local open_blockers
        open_blockers=$(grep -c '\[.*OPEN\|status.*open' "$SCRATCHPAD_DIR/blockers.md" 2>/dev/null || echo "0")
        if [[ "$open_blockers" -gt 0 ]]; then
          echo "## Open Blockers ($open_blockers)"
          echo ""
          grep -A2 "status.*open\|severity.*HIGH\|severity.*MEDIUM" "$SCRATCHPAD_DIR/blockers.md" 2>/dev/null || echo "_See blockers.md for details_"
          echo ""
        fi
      fi

      # Include skills applied if any
      if [[ -f "$SCRATCHPAD_DIR/skills_applied.json" ]]; then
        local skills_count
        skills_count=$(grep -c '"skillId"' "$SCRATCHPAD_DIR/skills_applied.json" 2>/dev/null || echo "0")
        if [[ "$skills_count" -gt 0 ]]; then
          echo "## Skills Applied ($skills_count)"
          echo ""
          node -e "
            const fs = require('fs');
            const skills = JSON.parse(fs.readFileSync('$SCRATCHPAD_DIR/skills_applied.json', 'utf-8'));
            skills.forEach(s => {
              const status = s.success ? '✅' : '❌';
              console.log(\`- \${status} \${s.skillId}\`);
            });
          " 2>/dev/null || echo "_See skills_applied.json for details_"
          echo ""
        fi
      fi

      echo "---"
      echo "_To resume this session, use: \`scratchpad-manager.js resume $SESSION_ID\`_"

    } > "$summary_file" 2>/dev/null || log "WARN" "Could not write session summary"

    log "INFO" "Session summary saved: $summary_file"
  fi

  # Clean up session environment file
  if [[ -f "${HOME}/.claude/session.env" ]]; then
    rm -f "${HOME}/.claude/session.env" 2>/dev/null || true
    log "INFO" "Cleaned up session environment"
  fi

  log "INFO" "Session end scratchpad hook complete"
}

# Run main
main "$@"

exit 0
