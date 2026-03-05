#!/bin/bash
#
# SOQL Enhancement Hook (PreToolUse)
#
# Purpose: Automatically enhance SOQL queries with:
#   - Security enforcement (WITH SECURITY_ENFORCED)
#   - Org-specific object/field mappings
#   - Query optimization hints
#   - Data quality filters
#   - ERROR PREVENTION: Validates and auto-corrects commands before execution
#
# Hook Type: PreToolUse (v2.0.10+)
# Triggers: Before Bash tool execution
# Target: sf data query, sf project deploy, sf data upsert bulk commands
#
# Configuration: .claude/settings.local.json
# {
#   "hooks": {
#     "soql-enhancement": {
#       "enabled": true,
#       "enforce-security": true,
#       "use-org-mappings": true,
#       "optimize-queries": true,
#       "error-prevention": true,
#       "org-quirks-file": "instances/{org}/ORG_QUIRKS.json"
#     }
#   }
# }
#
# Created: 2025-10-09
# Version: 2.0.0 (Added error prevention system)

set -euo pipefail

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
PROJECT_ROOT="$DOMAIN_ROOT"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    DOMAIN_NAME="$(basename "$DOMAIN_ROOT")"
    case "$CLAUDE_PLUGIN_ROOT" in
        *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) PROJECT_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
    esac
fi

# Get the tool input from Claude Code
TOOL_NAME="${1:-}"
TOOL_INPUT="${2:-}"

# Only process Bash tool calls
if [[ "$TOOL_NAME" != "Bash" ]]; then
    # Return original input unchanged for non-Bash tools
    echo "$TOOL_INPUT"
    exit 0
fi

# Check if this is an SF CLI command (query, deploy, bulk, metadata)
SF_COMMAND_PATTERN='sf[[:space:]]+(data[[:space:]]+query|data:query|project[[:space:]]+deploy|project:deploy|data[[:space:]]+upsert[[:space:]]+bulk|data:upsert:bulk)'

if [[ ! "$TOOL_INPUT" =~ $SF_COMMAND_PATTERN ]]; then
    # Not an SF CLI command, return unchanged
    echo "$TOOL_INPUT"
    exit 0
fi

# Extract the command from the tool input (handle JSON format)
COMMAND=""
if [[ "$TOOL_INPUT" =~ \"command\":[[:space:]]*\"([^\"]+)\" ]]; then
    COMMAND="${BASH_REMATCH[1]}"
else
    # Try extracting without JSON (direct command)
    COMMAND="$TOOL_INPUT"
fi

# =============================================================================
# ERROR PREVENTION SYSTEM (New in v2.0.0)
# =============================================================================
# Intercept command for validation and auto-correction before enhancement

ERROR_PREVENTION_ENABLED=${ERROR_PREVENTION_ENABLED:-true}
if [[ "$ERROR_PREVENTION_ENABLED" == "true" ]]; then
    INTERCEPTOR="$PROJECT_ROOT/scripts/lib/sf-command-interceptor.js"

    if [[ -f "$INTERCEPTOR" ]]; then
        # Run interceptor
        INTERCEPTION_RESULT=$(node "$INTERCEPTOR" "$COMMAND" 2>&1 || true)

        # Check if interception succeeded
        if echo "$INTERCEPTION_RESULT" | grep -q "Command validated successfully"; then
            # Extract corrected command if present
            if echo "$INTERCEPTION_RESULT" | grep -q "Corrected command:"; then
                CORRECTED_COMMAND=$(echo "$INTERCEPTION_RESULT" | grep "Corrected command:" | sed 's/.*Corrected command:[[:space:]]*//')
                COMMAND="$CORRECTED_COMMAND"

                # Log correction
                if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" ]]; then
                    LOG_DIR="$PROJECT_ROOT/.claude/logs"
                    mkdir -p "$LOG_DIR"
                    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Auto-corrected command" >> "$LOG_DIR/error-prevention.log"
                    echo "Corrected: $CORRECTED_COMMAND" >> "$LOG_DIR/error-prevention.log"
                fi
            fi
        elif echo "$INTERCEPTION_RESULT" | grep -q "Command validation failed"; then
            # Validation failed - block command and show guidance
            echo "❌ ERROR PREVENTION: Command blocked due to validation errors" >&2
            echo "$INTERCEPTION_RESULT" >&2
            exit 1
        fi
    fi
fi

# Continue with existing SOQL enhancement logic only for query commands
if [[ ! "$COMMAND" =~ sf[[:space:]]+(data[[:space:]]+query|data:query) ]]; then
    # Not a query command, skip SOQL enhancement
    # Return command as-is (possibly corrected by error prevention)
    if [[ "$TOOL_INPUT" =~ \"command\" ]]; then
        echo "$TOOL_INPUT" | sed "s|\"command\":[[:space:]]*\"[^\"]*\"|\"command\": \"$COMMAND\"|"
    else
        echo "$COMMAND"
    fi
    exit 0
fi

# Check if enhancement is enabled
ENHANCEMENT_ENABLED=${SOQL_ENHANCEMENT_ENABLED:-true}
if [[ "$ENHANCEMENT_ENABLED" != "true" ]]; then
    echo "$TOOL_INPUT"
    exit 0
fi

# Path to enhancement engine
ENHANCEMENT_ENGINE="$PROJECT_ROOT/scripts/lib/soql-enhancement-engine.js"

# Check if enhancement engine exists
if [[ ! -f "$ENHANCEMENT_ENGINE" ]]; then
    # Enhancement engine not found, return original
    echo "$TOOL_INPUT"
    exit 0
fi

# Get current org from environment or SF_TARGET_ORG
CURRENT_ORG="${SF_TARGET_ORG:-}"
if [[ -z "$CURRENT_ORG" ]]; then
    # Try to extract from command (--target-org flag)
    if [[ "$COMMAND" =~ --target-org[[:space:]]+([^[:space:]]+) ]]; then
        CURRENT_ORG="${BASH_REMATCH[1]}"
    fi
fi

# If still no org, return original (can't enhance without org context)
if [[ -z "$CURRENT_ORG" ]]; then
    echo "$TOOL_INPUT"
    exit 0
fi

# Extract the SOQL query from the command
SOQL_QUERY=""
if [[ "$COMMAND" =~ --query[[:space:]]+\"([^\"]+)\" ]]; then
    SOQL_QUERY="${BASH_REMATCH[1]}"
elif [[ "$COMMAND" =~ --query[[:space:]]+\'([^\']+)\' ]]; then
    SOQL_QUERY="${BASH_REMATCH[1]}"
fi

# If no query found, return original
if [[ -z "$SOQL_QUERY" ]]; then
    echo "$TOOL_INPUT"
    exit 0
fi

# Log enhancement attempt (if logging enabled)
if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" ]]; then
    LOG_DIR="$PROJECT_ROOT/.claude/logs"
    mkdir -p "$LOG_DIR"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Enhancing query for org: $CURRENT_ORG" >> "$LOG_DIR/soql-enhancement.log"
    echo "Original: $SOQL_QUERY" >> "$LOG_DIR/soql-enhancement.log"
fi

# Call enhancement engine
ENHANCED_QUERY=""
if ENHANCED_QUERY=$(node "$ENHANCEMENT_ENGINE" enhance "$CURRENT_ORG" "$SOQL_QUERY" 2>/dev/null); then
    # Enhancement succeeded
    if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" ]]; then
        echo "Enhanced: $ENHANCED_QUERY" >> "$LOG_DIR/soql-enhancement.log"
    fi

    # Replace original query with enhanced query in command
    ENHANCED_COMMAND="${COMMAND//$SOQL_QUERY/$ENHANCED_QUERY}"

    # Return enhanced command in same format as input
    if [[ "$TOOL_INPUT" =~ \"command\" ]]; then
        # JSON format - preserve structure
        echo "$TOOL_INPUT" | sed "s|\"command\":[[:space:]]*\"[^\"]*\"|\"command\": \"$ENHANCED_COMMAND\"|"
    else
        # Direct command format
        echo "$ENHANCED_COMMAND"
    fi
else
    # Enhancement failed, return original
    if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" ]]; then
        echo "Enhancement failed, using original query" >> "$LOG_DIR/soql-enhancement.log"
    fi
    echo "$TOOL_INPUT"
fi

exit 0
