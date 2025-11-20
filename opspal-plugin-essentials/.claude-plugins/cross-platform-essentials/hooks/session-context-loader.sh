#!/bin/bash

###############################################################################
# Session Context Loader Hook
#
# Automatically loads relevant context at session start.
#
# Addresses: Phase 3.3 - Cross-session context continuity
#
# Prevention Target: Context lost between sessions
#
# How It Works:
# 1. Triggered at session start
# 2. Loads recent contexts relevant to working directory
# 3. Displays context summary
# 4. Sets environment variables for easy access
#
# Configuration:
#   SESSION_CONTEXT_ENABLED=1       # Enable context loading (default: 1)
#   SESSION_CONTEXT_AUTO_DISPLAY=1  # Auto-display contexts (default: 1)
#   SESSION_CONTEXT_TTL_DAYS=7      # Context TTL (default: 7)
#
# Exit Codes:
#   0 - Always (non-blocking, informational only)
###############################################################################

# Configuration
ENABLED="${SESSION_CONTEXT_ENABLED:-1}"
AUTO_DISPLAY="${SESSION_CONTEXT_AUTO_DISPLAY:-1}"
TTL_DAYS="${SESSION_CONTEXT_TTL_DAYS:-7}"

# Only run if enabled
if [ "$ENABLED" != "1" ]; then
  exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
CONTEXT_SCRIPT="$PLUGIN_DIR/scripts/lib/session-context-manager.js"

# OutputFormatter and HookLogger
OUTPUT_FORMATTER="$PLUGIN_DIR/scripts/lib/output-formatter.js"
HOOK_LOGGER="$PLUGIN_DIR/scripts/lib/hook-logger.js"
HOOK_NAME="session-context-loader"

# Check if context manager exists
if [ ! -f "$CONTEXT_SCRIPT" ]; then
  exit 0  # Don't block if context manager not available
fi

# Get current working directory context ID
CWD_CONTEXT_ID=$(echo "$PWD" | md5sum | cut -d' ' -f1)

# Load recent contexts for this directory
CONTEXTS=$(node "$CONTEXT_SCRIPT" list 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$CONTEXTS" ]; then
  # No contexts or error, exit silently
  exit 0
fi

# Count contexts
CONTEXT_COUNT=$(echo "$CONTEXTS" | jq 'length' 2>/dev/null || echo "0")

if [ "$CONTEXT_COUNT" == "0" ]; then
  # No contexts available
  exit 0
fi

if [ "$AUTO_DISPLAY" == "1" ] && [ "$CONTEXT_COUNT" != "0" ]; then
  # Get recent contexts preview
  CONTEXTS_PREVIEW=$(echo "$CONTEXTS" | jq -r '.[:3] | .[] | "\(.id) - \(.summary) (\(.timestamp[:10]))"' 2>/dev/null | tr '\n' ';')

  # Log context availability
  [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Session contexts available" \
    "{\"contextCount\":$CONTEXT_COUNT,\"workingDir\":\"$PWD\"}"

  if [ -f "$OUTPUT_FORMATTER" ]; then
    node "$OUTPUT_FORMATTER" info \
      "Session Context Available" \
      "Found saved context(s) from recent sessions in this directory" \
      "Context Count:$CONTEXT_COUNT,Working Directory:$PWD,Recent Contexts:$CONTEXTS_PREVIEW" \
      "Load context: node $CONTEXT_SCRIPT load <context-id>,List all: node $CONTEXT_SCRIPT list" \
      "Context continuity enabled"
  else
    echo "📋 Session Context Available"
    echo "   Found $CONTEXT_COUNT saved context(s) from recent sessions"
    echo ""

    # Show most recent 3 contexts
    echo "$CONTEXTS" | jq -r '.[:3] | .[] | "   • \(.id) - \(.summary) (\(.timestamp[:10]))"' 2>/dev/null

    echo ""
    echo "   Load context: node $CONTEXT_SCRIPT load <context-id>"
    echo "   List all: node $CONTEXT_SCRIPT list"
    echo ""
  fi
fi

# Export context info for scripts to use
export SESSION_CONTEXT_AVAILABLE="true"
export SESSION_CONTEXT_COUNT="$CONTEXT_COUNT"

# Always exit 0 (non-blocking)
exit 0
