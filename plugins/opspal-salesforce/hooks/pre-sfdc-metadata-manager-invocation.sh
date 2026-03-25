#!/usr/bin/env bash
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
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Success (contexts injected or none needed)
#   1 - Validation error (context injection failed)
#   2 - Missing dependency (required scripts not found)
#   5 - Config error (missing user message)
#
# Updated: 2026-01-15 - Standardized exit codes
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if ! command -v jq &>/dev/null; then
    echo "[pre-sfdc-metadata-manager-invocation] jq not found, skipping" >&2
    exit 0
fi

KEYWORD_DETECTOR="$PLUGIN_DIR/scripts/lib/keyword-detector.js"
CONTEXT_INJECTOR="$PLUGIN_DIR/scripts/lib/context-injector.js"
KEYWORD_CONFIG="$PLUGIN_DIR/contexts/metadata-manager/keyword-mapping.json"
CONTEXTS_DIR="$PLUGIN_DIR/contexts/metadata-manager"
HOOK_INPUT=""

# Source standardized exit codes
if [[ -f "${PLUGIN_DIR}/scripts/lib/sf-exit-codes.sh" ]]; then
    source "${PLUGIN_DIR}/scripts/lib/sf-exit-codes.sh"
else
    # Fallback exit codes
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
    EXIT_MISSING_DEPENDENCY=2
    EXIT_CONFIG_ERROR=5
fi

# Get user message from first argument or environment variable
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

USER_MESSAGE="${1:-${AGENT_MESSAGE:-$(printf '%s' "$HOOK_INPUT" | jq -r '.prompt // .message // .tool_input.prompt // .tool_input.message // empty' 2>/dev/null || echo "")}}"

if [ -z "$USER_MESSAGE" ]; then
    echo "[pre-sfdc-metadata-manager-invocation] INFO: no agent message/runtime context, skipping" >&2
    exit 0
fi

# Validate required files exist
if [ ! -f "$KEYWORD_DETECTOR" ]; then
    echo "Error: Keyword detector not found at $KEYWORD_DETECTOR" >&2
    exit $EXIT_MISSING_DEPENDENCY
fi

if [ ! -f "$CONTEXT_INJECTOR" ]; then
    echo "Error: Context injector not found at $CONTEXT_INJECTOR" >&2
    exit $EXIT_MISSING_DEPENDENCY
fi

if [ ! -f "$KEYWORD_CONFIG" ]; then
    echo "Error: Keyword mapping config not found at $KEYWORD_CONFIG" >&2
    exit $EXIT_MISSING_DEPENDENCY
fi

# Run keyword detection
MATCHED_CONTEXTS=$(node "$KEYWORD_DETECTOR" "$USER_MESSAGE" --config "$KEYWORD_CONFIG" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "Error: Keyword detection failed" >&2
    exit $EXIT_VALIDATION_ERROR
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
    exit $EXIT_VALIDATION_ERROR
fi

# Output enhanced message: [INJECTED CONTEXTS] + [SEPARATOR] + [USER MESSAGE]
cat <<EOF
$INJECTED_CONTEXT

---

**Original User Request:**
$USER_MESSAGE
EOF

exit 0
