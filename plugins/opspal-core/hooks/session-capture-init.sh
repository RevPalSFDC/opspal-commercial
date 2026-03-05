#!/bin/bash
# session-capture-init.sh - Initialize session context capture
#
# Hook Type: Notification (SessionStart)
# Purpose: Initialize SessionCollector for the current session
#
# This hook runs silently in the background to set up session tracking.
# No output is returned to avoid disrupting the user experience.

set -e

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

# Skip if session capture is disabled
if [ "$DISABLE_SESSION_CAPTURE" = "1" ]; then
    exit 0
fi

# Generate session ID if not set
if [ -z "$CLAUDE_SESSION_ID" ]; then
    export CLAUDE_SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N | sha256sum | head -c 36)
fi

# Ensure session context directory exists
SESSION_DIR="$HOME/.claude/session-context"
mkdir -p "$SESSION_DIR"

# Initialize session file
SESSION_FILE="$SESSION_DIR/${CLAUDE_SESSION_ID}.json"

if [ ! -f "$SESSION_FILE" ]; then
    # Create initial session data
    cat > "$SESSION_FILE" << EOF
{
  "session_id": "${CLAUDE_SESSION_ID}",
  "started_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "last_activity_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "duration_minutes": 0,
  "files_edited": [],
  "tools_used": {},
  "agents_invoked": [],
  "errors_captured": [],
  "strategies_used": [],
  "org_context": null,
  "event_count": 0,
  "metadata": {
    "platform": "$(uname -s)",
    "cwd": "$(pwd)",
    "user": "${USER:-unknown}"
  }
}
EOF
fi

# Export session ID for other hooks
echo "export CLAUDE_SESSION_ID=${CLAUDE_SESSION_ID}" > "$SESSION_DIR/.current_session"

# Success (silent)
exit 0
