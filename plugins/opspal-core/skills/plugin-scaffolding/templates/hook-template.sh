#!/bin/bash
# =============================================================================
# Hook Template
# =============================================================================
# File Location: hooks/{hook-name}.sh
#
# Hook Types:
#   - UserPromptSubmit: Before prompt processing
#   - PreToolUse: Before tool execution
#   - PostToolUse: After tool execution
#   - SessionStart: When session begins
#   - Stop: When session ends
#   - PreCompact: Before context compaction
#
# Input (via stdin for UserPromptSubmit):
#   {"message": "User's message text"}
#
# Output (JSON to stdout):
#   {
#     "systemMessage": "Message prepended to prompt",
#     "blockExecution": false,
#     "blockMessage": "Reason for blocking"
#   }
#
# Exit Codes:
#   0: Success
#   1: General error
#   2: Configuration error
#   3: Dependency missing
#   4: Permission denied
#   5: Timeout
#   6: Validation failed
#   7: User intervention required
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_NAME="{hook-name}"
VERSION="1.0.0"

# Use CLAUDE_PLUGIN_ROOT if available, otherwise calculate
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
else
  PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# =============================================================================
# Dependencies
# =============================================================================

# Source error handler if available
if [ -f "$PLUGIN_ROOT/hooks/lib/error-handler.sh" ]; then
  source "$PLUGIN_ROOT/hooks/lib/error-handler.sh"
fi

# Check required tools
check_dependencies() {
  local missing=()

  command -v jq >/dev/null 2>&1 || missing+=("jq")
  command -v node >/dev/null 2>&1 || missing+=("node")

  if [ ${#missing[@]} -gt 0 ]; then
    echo "Missing dependencies: ${missing[*]}" >&2
    exit 3
  fi
}

# =============================================================================
# Environment Variables
# =============================================================================

# Enable/disable this hook
ENABLE_HOOK="${ENABLE_{HOOK_NAME_UPPER}:-1}"

# Debug mode
DEBUG="${DEBUG:-0}"

# =============================================================================
# Utility Functions
# =============================================================================

log_debug() {
  if [ "$DEBUG" = "1" ]; then
    echo "[DEBUG][$HOOK_NAME] $*" >&2
  fi
}

log_info() {
  echo "[INFO][$HOOK_NAME] $*" >&2
}

log_error() {
  echo "[ERROR][$HOOK_NAME] $*" >&2
}

# Output success response
output_success() {
  local system_message="${1:-}"

  cat <<EOF
{
  "systemMessage": "$system_message"
}
EOF
}

# Output blocking response
output_block() {
  local reason="$1"
  local message="${2:-}"

  cat <<EOF
{
  "blockExecution": true,
  "blockMessage": "$reason",
  "systemMessage": "$message"
}
EOF
}

# Output empty response (no modification)
output_empty() {
  echo '{}'
}

# =============================================================================
# Main Logic
# =============================================================================

main() {
  # Check if hook is enabled
  if [ "$ENABLE_HOOK" != "1" ]; then
    log_debug "Hook disabled"
    output_empty
    exit 0
  fi

  # Check dependencies
  check_dependencies

  # Read input from stdin (for UserPromptSubmit)
  local input=""
  if [ ! -t 0 ]; then
    input=$(cat)
  fi

  # Parse input
  local message=""
  if [ -n "$input" ]; then
    message=$(echo "$input" | jq -r '.message // empty' 2>/dev/null || echo "")
  fi

  log_debug "Processing message: ${message:0:100}..."

  # ==========================================================================
  # YOUR LOGIC HERE
  # ==========================================================================

  # Example: Check for specific pattern
  # if echo "$message" | grep -qi "dangerous"; then
  #   output_block "Dangerous operation detected" "Please confirm before proceeding"
  #   exit 0
  # fi

  # Example: Prepend system message
  # local system_msg="Using appropriate sub-agents for this task"
  # output_success "$system_msg"
  # exit 0

  # ==========================================================================
  # Default: No modification
  # ==========================================================================

  output_empty
}

# =============================================================================
# Entry Point
# =============================================================================

main "$@"
