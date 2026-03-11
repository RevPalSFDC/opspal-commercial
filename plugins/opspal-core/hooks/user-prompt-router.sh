#!/bin/bash

#
# User Prompt Router - Automatic Agent Routing Hook
#
# Automatically analyzes user prompts and routes to the correct specialized agent.
# This hook runs before Claude processes the request to ensure optimal agent selection.
#
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24
#

set -e

# Source standardized error handler for centralized logging
SCRIPT_DIR_INIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="${SCRIPT_DIR_INIT}/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="user-prompt-router"
    # Use lenient mode since this hook has its own error handling
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
ENABLE_AUTO_ROUTING="${ENABLE_AUTO_ROUTING:-1}"
ROUTING_CONFIDENCE_THRESHOLD="${ROUTING_CONFIDENCE_THRESHOLD:-0.7}"
COMPLEXITY_THRESHOLD="${COMPLEXITY_THRESHOLD:-0.7}"
HOOK_TIMEOUT="${HOOK_TIMEOUT:-5}"
VERBOSE="${ROUTING_VERBOSE:-0}"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TASK_ROUTER="$PLUGIN_ROOT/scripts/lib/task-router.js"
# Resolve complexity-scorer through encrypted asset runtime (may be .enc)
ENC_RESOLVER="$PLUGIN_ROOT/hooks/lib/resolve-encrypted-asset.sh"
if [[ -f "$ENC_RESOLVER" ]]; then
    source "$ENC_RESOLVER"
    COMPLEXITY_SCORER=$(resolve_enc_asset "$PLUGIN_ROOT" "opspal-core" "scripts/lib/complexity-scorer.js")
else
    COMPLEXITY_SCORER="$PLUGIN_ROOT/scripts/lib/complexity-scorer.js"
fi
ROUTING_INDEX="$PLUGIN_ROOT/routing-index.json"
AGENT_RESOLVER="$PLUGIN_ROOT/scripts/lib/agent-alias-resolver.js"

# OutputFormatter and HookLogger
OUTPUT_FORMATTER="$PLUGIN_ROOT/scripts/lib/output-formatter.js"
HOOK_LOGGER="$PLUGIN_ROOT/scripts/lib/hook-logger.js"
HOOK_NAME="user-prompt-router"

# Log file
LOG_FILE="${ROUTING_LOG_FILE:-${TMPDIR:-/tmp}/routing-hook.log}"

# Function to log messages
log() {
    if [ "$VERBOSE" = "1" ]; then
        echo "[ROUTING] $1" >&2
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    fi
}

# Function to check if routing is enabled
is_enabled() {
    [ "$ENABLE_AUTO_ROUTING" = "1" ] || [ "$ENABLE_AUTO_ROUTING" = "true" ]
}

# Function to check if user wants to skip routing
should_skip_routing() {
    local prompt="$1"
    # Check for override flags
    if echo "$prompt" | grep -qiE '\[DIRECT\]|\[SKIP_ROUTING\]|\[NO_AGENT\]'; then
        return 0
    fi
    return 1
}

# Function to extract user-specified agent
extract_user_agent() {
    local prompt="$1"
    # Check for [USE: agent-name] pattern
    if echo "$prompt" | grep -qE '\[USE:[[:space:]]*([-a-z0-9:]+)\]'; then
        echo "$prompt" | sed -nE 's/.*\[USE:[[:space:]]*([-a-z0-9:]+)\].*/\1/p'
        return 0
    fi
    return 1
}

# Function to resolve short agent name to fully-qualified name
# e.g., 'sfdc-object-auditor' -> 'opspal-salesforce:sfdc-object-auditor'
resolve_agent_name() {
    local agent_name="$1"

    # Already fully qualified?
    if echo "$agent_name" | grep -q ':'; then
        echo "$agent_name"
        return 0
    fi

    # Use the alias resolver if available
    if [ -f "$AGENT_RESOLVER" ]; then
        local resolved
        resolved=$(node "$AGENT_RESOLVER" resolve "$agent_name" 2>/dev/null || echo "")
        if [ -n "$resolved" ]; then
            log "Resolved agent: $agent_name -> $resolved"
            echo "$resolved"
            return 0
        fi
    fi

    # Fallback: return original name
    echo "$agent_name"
}

# Main routing logic
main() {
    log "Auto-routing hook triggered"

    # Check if routing is enabled
    if ! is_enabled; then
        log "Auto-routing disabled"
        exit 0
    fi

    # Read user prompt from stdin
    USER_PROMPT=$(cat)

    # Check if user wants to skip routing
    if should_skip_routing "$USER_PROMPT"; then
        log "User requested direct execution"
        echo "$USER_PROMPT"
        exit 0
    fi

    # Check if user specified an agent
    USER_AGENT=$(extract_user_agent "$USER_PROMPT")
    if [ -n "$USER_AGENT" ]; then
        # Resolve short name to fully-qualified name
        RESOLVED_AGENT=$(resolve_agent_name "$USER_AGENT")
        log "User specified agent: $USER_AGENT -> $RESOLVED_AGENT"

        # Log user-specified routing
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "User specified agent via [USE:] flag" \
          "{\"agent\":\"$RESOLVED_AGENT\",\"original\":\"$USER_AGENT\"}" >/dev/null 2>&1

        # Prepend routing instruction and output
        echo "Using the $RESOLVED_AGENT agent. $USER_PROMPT"
        exit 0
    fi

    # Check if required files exist
    if [ ! -f "$TASK_ROUTER" ]; then
        log "WARNING: task-router.js not found at $TASK_ROUTER"
        echo "$USER_PROMPT"
        exit 0
    fi

    if [ ! -f "$ROUTING_INDEX" ]; then
        log "WARNING: routing-index.json not found at $ROUTING_INDEX"
        echo "$USER_PROMPT"
        exit 0
    fi

    # Run task router with timeout
    log "Analyzing prompt for routing..."
    ROUTING_RESULT=$(timeout "$HOOK_TIMEOUT" node "$TASK_ROUTER" "$USER_PROMPT" 2>/dev/null || true)

    if [ -z "$ROUTING_RESULT" ]; then
        log "Routing analysis timed out or failed"
        echo "$USER_PROMPT"
        exit 0
    fi

    # Parse routing result to extract recommended agent
    RECOMMENDED_AGENT=$(echo "$ROUTING_RESULT" | grep "RECOMMENDED AGENT:" | sed 's/.*RECOMMENDED AGENT: //' | tr -d '[:space:]🎯' || echo "")
    CONFIDENCE=$(echo "$ROUTING_RESULT" | grep "Confidence:" | sed 's/.*Confidence: \([0-9]\+\)%.*/\1/' || echo "0")
    COMPLEXITY=$(echo "$ROUTING_RESULT" | grep "Complexity:" | sed 's/.*Complexity: [A-Z]* (\([0-9.]\+\)).*/\1/' || echo "0.0")

    log "Routing analysis complete:"
    log "  Agent: $RECOMMENDED_AGENT"
    log "  Confidence: ${CONFIDENCE}%"
    log "  Complexity: $COMPLEXITY"

    # Determine if we should auto-route
    if [ -z "$RECOMMENDED_AGENT" ]; then
        log "No agent recommended - direct execution"
        echo "$USER_PROMPT"
        exit 0
    fi

    # Convert confidence percentage to decimal
    CONFIDENCE_DECIMAL=$(echo "scale=2; $CONFIDENCE / 100" | bc 2>/dev/null || echo "0")

    # Check if complexity is high enough to require routing
    SHOULD_ROUTE=0
    if (( $(echo "$COMPLEXITY >= $COMPLEXITY_THRESHOLD" | bc -l) )); then
        log "High complexity detected ($COMPLEXITY >= $COMPLEXITY_THRESHOLD) - auto-routing REQUIRED"
        SHOULD_ROUTE=1
    elif (( $(echo "$CONFIDENCE_DECIMAL >= $ROUTING_CONFIDENCE_THRESHOLD" | bc -l) )); then
        log "High confidence ($CONFIDENCE_DECIMAL >= $ROUTING_CONFIDENCE_THRESHOLD) - auto-routing RECOMMENDED"
        SHOULD_ROUTE=1
    fi || true

    # Apply routing decision
    if [ "$SHOULD_ROUTE" = "1" ]; then
        log "AUTO-ROUTING: Prepending agent instruction"

        # Log auto-routing decision
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Auto-routing to specialized agent" \
          "{\"agent\":\"$RECOMMENDED_AGENT\",\"confidence\":${CONFIDENCE:-0},\"complexity\":\"$COMPLEXITY\",\"reason\":\"threshold_met\"}" >/dev/null 2>&1

        # Prepend routing instruction
        echo "Using the $RECOMMENDED_AGENT agent. $USER_PROMPT"
    else
        log "Thresholds not met - proceeding with direct execution"
        log "  Confidence: $CONFIDENCE_DECIMAL < $ROUTING_CONFIDENCE_THRESHOLD"

        # Log direct execution decision
        [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Direct execution - thresholds not met" \
          "{\"recommendedAgent\":\"$RECOMMENDED_AGENT\",\"confidence\":${CONFIDENCE:-0},\"complexity\":\"$COMPLEXITY\",\"reason\":\"threshold_not_met\"}" >/dev/null 2>&1
        log "  Complexity: $COMPLEXITY < $COMPLEXITY_THRESHOLD"
        echo "$USER_PROMPT"
    fi

    log "Hook complete"
}

# Run main function
main || true

exit 0
