#!/bin/bash
#
# Enhanced UserPromptSubmit Hook with Auto-Router Integration
#
# This hook processes user requests and returns structured JSON that Claude Code understands:
# - systemMessage: Message to inject into Claude's context
# - suggestedAgent: Which agent to use (optional)
# - blockExecution: Whether to prevent execution (optional)
#
# Now integrates with auto-agent-router.js for:
# - Complexity scoring
# - Pattern matching from agent-triggers.json
# - Analytics tracking
# - Learning from usage patterns

set -euo pipefail

# Read JSON input from stdin
HOOK_INPUT=$(cat)

# Extract user message
USER_MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.user_message // .message // ""' 2>/dev/null || echo "")

# If no user message, exit gracefully
if [ -z "$USER_MESSAGE" ]; then
  echo '{}' # Empty JSON response
  exit 0
fi

# Get plugin root path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
resolve_domain_root() {
  local dir="$1"
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/scripts" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "$1"
}

DOMAIN_ROOT="$(resolve_domain_root "$SCRIPT_DIR")"
PLUGIN_ROOT="$DOMAIN_ROOT"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
  DOMAIN_NAME="$(basename "$DOMAIN_ROOT")"
  case "$CLAUDE_PLUGIN_ROOT" in
    *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
  esac
fi
AUTO_ROUTER="$PLUGIN_ROOT/scripts/auto-agent-router.js"

# NEW: Detect environment and export CLAUDE_ENV
# This allows agents to know if they're in Desktop vs CLI mode
if command -v node &>/dev/null; then
  # Try developer-tools-plugin location first, then salesforce-plugin
  ENV_DETECTOR="${CLAUDE_PLUGIN_ROOT:-}/packages/opspal-core/developer-tools-plugin/scripts/lib/environment-detector.js"
  if [ ! -f "$ENV_DETECTOR" ]; then
    # Fallback: Look in salesforce-plugin if symlinked
    ENV_DETECTOR="$PLUGIN_ROOT/scripts/lib/environment-detector.js"
  fi

  if [ -f "$ENV_DETECTOR" ]; then
    ENV_RESULT=$(node "$ENV_DETECTOR" 2>/dev/null || echo '{}')
    DETECTED_ENV=$(echo "$ENV_RESULT" | jq -r '.environment // ""' 2>/dev/null || echo "")

    if [ -n "$DETECTED_ENV" ] && [ "$DETECTED_ENV" != "null" ]; then
      export CLAUDE_ENV="$DETECTED_ENV"

      # If user is asking about MCP config and environment is known, suggest specialized agent
      if echo "$USER_MESSAGE" | grep -iE "(mcp|config.*server|server.*config|setup.*mcp|configure.*mcp)" >/dev/null 2>&1; then
        case "$DETECTED_ENV" in
          DESKTOP)
            # Route to Desktop-specific MCP agent
            SYSTEM_MSG="💡 MCP Configuration Assistance (Claude Desktop)

AGENT: mcp-config-desktop
Environment: Claude Desktop

This agent provides Desktop-specific guidance for:
- Editing ~/.claude/claude_desktop_config.json (NOT config.json)
- Desktop app restart workflow
- UI-based server status checking

Consider using: Task tool with subagent_type='mcp-config-desktop'"

            jq -n \
              --arg msg "$SYSTEM_MSG" \
              --arg agent "mcp-config-desktop" \
              '{systemMessage: $msg, suggestedAgent: $agent, mandatoryAgent: false, source: "environment-detection"}'

            exit 0
            ;;
          CLI)
            # Route to CLI-specific MCP agent
            SYSTEM_MSG="💡 MCP Configuration Assistance (Claude Code CLI)

AGENT: mcp-config-cli
Environment: Claude Code CLI

This agent provides CLI-specific guidance for:
- Editing ~/.claude/config.json or .mcp.json (NOT claude_desktop_config.json)
- /mcp restart commands
- Project-specific vs user-wide config

Consider using: Task tool with subagent_type='mcp-config-cli'"

            jq -n \
              --arg msg "$SYSTEM_MSG" \
              --arg agent "mcp-config-cli" \
              '{systemMessage: $msg, suggestedAgent: $agent, mandatoryAgent: false, source: "environment-detection"}'

            exit 0
            ;;
        esac
      fi
    fi
  fi
fi

# Check if auto-router exists and Node.js is available
if command -v node &>/dev/null && [ -f "$AUTO_ROUTER" ]; then
  # Call auto-router with --json flag for clean JSON output
  ROUTING_RESULT=$(node "$AUTO_ROUTER" route "$USER_MESSAGE" --json 2>/dev/null || echo '{"routed":false}')

  # Parse routing result
  ROUTED=$(echo "$ROUTING_RESULT" | jq -r '.routed // false')
  AGENT=$(echo "$ROUTING_RESULT" | jq -r '.agent // ""')
  CONFIDENCE=$(echo "$ROUTING_RESULT" | jq -r '.confidence // 0')
  COMPLEXITY=$(echo "$ROUTING_RESULT" | jq -r '.complexity // 0')
  AUTO_INVOKED=$(echo "$ROUTING_RESULT" | jq -r '.autoInvoked // false')
  REQUIRES_CONFIRMATION=$(echo "$ROUTING_RESULT" | jq -r '.requiresConfirmation // false')

  # If router found a match, use it
  if [ "$ROUTED" = "true" ] && [ -n "$AGENT" ]; then
    # Determine if this is mandatory based on confidence (1.0 = mandatory in auto-router)
    IS_MANDATORY="false"
    if [ "$(echo "$CONFIDENCE == 1.0" | bc -l 2>/dev/null || echo "0")" = "1" ]; then
      IS_MANDATORY="true"
    fi

    # Build system message based on routing decision
    if [ "$IS_MANDATORY" = "true" ]; then
      SYSTEM_MSG="🚫 BLOCKED: High-risk operation detected (Complexity: ${COMPLEXITY}, Confidence: ${CONFIDENCE})

MANDATORY AGENT REQUIRED: $AGENT

To proceed:
1. Use Task tool with subagent_type='$AGENT'
2. Let the agent handle validation and execution
3. Review agent output before confirming

This enforcement prevents deployment failures, data loss, and production incidents."
    elif [ "$AUTO_INVOKED" = "true" ]; then
      SYSTEM_MSG="🤖 AUTO-ROUTING: Operation complexity and confidence scores indicate agent usage is recommended

AGENT: $AGENT
Complexity: $(echo "$COMPLEXITY * 100" | bc)%
Confidence: $(echo "$CONFIDENCE * 100" | bc)%

The agent will be automatically invoked to handle this operation with best practices and validation."
    else
      SYSTEM_MSG="💡 Agent Suggestion: Consider using Task tool with subagent_type='$AGENT'

Complexity: $(echo "$COMPLEXITY * 100" | bc)%
Confidence: $(echo "$CONFIDENCE * 100" | bc)%

While not mandatory, using this agent will:
- Reduce errors and failures
- Apply best practices automatically
- Provide validation and safety checks"
    fi

    # Return JSON response
    jq -n \
      --arg msg "$SYSTEM_MSG" \
      --arg agent "$AGENT" \
      --argjson mandatory "$IS_MANDATORY" \
      '{systemMessage: $msg, suggestedAgent: $agent, mandatoryAgent: $mandatory}'

    exit 0
  fi
fi

# Fallback: If auto-router fails or not available, exit with empty response
echo '{}'
exit 0
