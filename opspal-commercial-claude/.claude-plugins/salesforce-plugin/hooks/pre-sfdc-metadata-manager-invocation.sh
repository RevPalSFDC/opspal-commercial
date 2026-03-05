#!/bin/bash
##############################################################################
# Pre-Agent Hook: sfdc-metadata-manager Progressive Disclosure
#
# Purpose: Automatically triggers keyword detection and context injection
#          when the sfdc-metadata-manager agent is invoked.
#
# Workflow:
#   1. Intercepts user message before agent processes it
#   2. Runs keyword detection to identify relevant contexts
#   3. If matches found, loads context files and injects them
#   4. Passes enhanced message (contexts + original) to agent
#
# Usage: Automatically invoked by Claude Code when agent is called
#
# Environment Variables:
#   AGENT_MESSAGE - The user's original message to the agent
#   PLUGIN_DIR    - Path to salesforce-plugin directory
#
# Exit Codes:
#   0 - Success (contexts injected or none needed)
#   1 - Error (keyword detection or context injection failed)
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYWORD_DETECTOR="$PLUGIN_DIR/scripts/lib/keyword-detector.js"
CONTEXT_INJECTOR="$PLUGIN_DIR/scripts/lib/context-injector.js"
KEYWORD_CONFIG="$PLUGIN_DIR/contexts/metadata-manager/keyword-mapping.json"
CONTEXTS_DIR="$PLUGIN_DIR/contexts/metadata-manager"

# Get user message from first argument or environment variable
USER_MESSAGE="${1:-${AGENT_MESSAGE:-}}"

if [ -z "$USER_MESSAGE" ]; then
    echo "Error: No user message provided" >&2
    echo "Usage: $0 <user_message>" >&2
    exit 1
fi

# Validate required files exist
if [ ! -f "$KEYWORD_DETECTOR" ]; then
    echo "Error: Keyword detector not found at $KEYWORD_DETECTOR" >&2
    exit 1
fi

if [ ! -f "$CONTEXT_INJECTOR" ]; then
    echo "Error: Context injector not found at $CONTEXT_INJECTOR" >&2
    exit 1
fi

if [ ! -f "$KEYWORD_CONFIG" ]; then
    echo "Error: Keyword mapping config not found at $KEYWORD_CONFIG" >&2
    exit 1
fi

# Run keyword detection
MATCHED_CONTEXTS=$(node "$KEYWORD_DETECTOR" "$USER_MESSAGE" --config "$KEYWORD_CONFIG" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "Error: Keyword detection failed" >&2
    exit 1
fi

# Check if any contexts matched
MATCH_COUNT=$(echo "$MATCHED_CONTEXTS" | jq -r '.matches | length' 2>/dev/null)

if [ -z "$MATCH_COUNT" ] || [ "$MATCH_COUNT" -eq 0 ]; then
    # No contexts matched - pass through original message
    echo "$USER_MESSAGE"
    exit 0
fi

# Inject contexts if matches found
INJECTED_CONTEXT=$(echo "$MATCHED_CONTEXTS" | node "$CONTEXT_INJECTOR" --stdin --base-dir "$CONTEXTS_DIR" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "Error: Context injection failed" >&2
    exit 1
fi

# Output enhanced message: [INJECTED CONTEXTS] + [SEPARATOR] + [USER MESSAGE]
cat <<EOF
$INJECTED_CONTEXT

---

**Original User Request:**
$USER_MESSAGE
EOF

exit 0
