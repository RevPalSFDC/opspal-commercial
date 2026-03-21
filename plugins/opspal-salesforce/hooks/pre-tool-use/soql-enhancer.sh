#!/usr/bin/env bash
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
# Version: 2.1.0 (Path resolution + structured interceptor logging)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT_DEFAULT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT_DEFAULT}"

# Some environments set CLAUDE_PLUGIN_ROOT to workspace root. Fall back to this plugin.
if [[ ! -d "$PROJECT_ROOT/scripts/lib" && -d "$PLUGIN_ROOT_DEFAULT/scripts/lib" ]]; then
    PROJECT_ROOT="$PLUGIN_ROOT_DEFAULT"
fi
if [[ ! -f "$PROJECT_ROOT/scripts/lib/sf-command-interceptor.js" && -f "$PLUGIN_ROOT_DEFAULT/scripts/lib/sf-command-interceptor.js" ]]; then
    PROJECT_ROOT="$PLUGIN_ROOT_DEFAULT"
fi

REPO_ROOT_DEFAULT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DEFAULT_LOG_ROOT="${REPO_ROOT_DEFAULT}/.claude/logs"
LOG_ROOT="${CLAUDE_HOOK_LOG_ROOT:-$DEFAULT_LOG_ROOT}"
FALLBACK_LOG_ROOT="/tmp/.claude/logs"
LOG_DIR=""
HOOK_LOG_FILE=""
ENHANCEMENT_LOG_FILE=""
ERROR_PREVENTION_LOG_FILE=""

resolve_log_root() {
    if mkdir -p "$LOG_ROOT" 2>/dev/null; then
        echo "$LOG_ROOT"
        return 0
    fi

    if mkdir -p "$FALLBACK_LOG_ROOT" 2>/dev/null; then
        echo "$FALLBACK_LOG_ROOT"
        return 0
    fi

    echo ""
    return 1
}

safe_append_line() {
    local line="$1"
    local target_file="$2"

    if [[ -z "$target_file" ]]; then
        return 0
    fi

    printf '%s\n' "$line" >> "$target_file" 2>/dev/null || true
}

emit_command_output() {
    local final_command="$1"
    if [[ "$TOOL_INPUT" =~ \"command\" ]]; then
        if command -v jq >/dev/null 2>&1 && echo "$TOOL_INPUT" | jq -e . >/dev/null 2>&1; then
            echo "$TOOL_INPUT" | jq -c --arg command "$final_command" '.command = $command'
        else
            local escaped_command
            escaped_command=$(printf '%s' "$final_command" | sed 's/\\/\\\\/g; s/"/\\"/g')
            printf '{"command":"%s"}\n' "$escaped_command"
        fi
    else
        echo "$final_command"
    fi
}

verbose_log() {
    local message="$1"
    if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" || "${ROUTING_VERBOSE:-0}" == "1" ]]; then
        echo "$message" >&2
    fi
}

hash_command() {
    local command_input="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        printf '%s' "$command_input" | sha256sum | awk '{print $1}'
        return
    fi
    if command -v shasum >/dev/null 2>&1; then
        printf '%s' "$command_input" | shasum -a 256 | awk '{print $1}'
        return
    fi
    echo "hash-unavailable"
}

log_interceptor_event() {
    local status="$1"
    local command_hash="$2"
    local corrected_hash="$3"
    local details="$4"

    if [[ -z "$HOOK_LOG_FILE" ]] || ! command -v jq >/dev/null 2>&1; then
        return 0
    fi

    local entry
    entry=$(jq -nc \
        --arg timestamp "$(date -Iseconds)" \
        --arg hook "soql-enhancer" \
        --arg phase "error_prevention" \
        --arg status "$status" \
        --arg commandHash "$command_hash" \
        --arg correctedHash "$corrected_hash" \
        --arg details "$details" \
        '{
            timestamp: $timestamp,
            hook: $hook,
            phase: $phase,
            status: $status,
            commandHash: $commandHash,
            correctedCommandHash: $correctedHash,
            details: $details
        }' 2>/dev/null || true)

    if [[ -n "$entry" ]]; then
        safe_append_line "$entry" "$HOOK_LOG_FILE"
    fi
}

LOG_DIR="$(resolve_log_root || true)"
if [[ -n "$LOG_DIR" ]]; then
    HOOK_LOG_FILE="$LOG_DIR/soql-enhancer.jsonl"
    ENHANCEMENT_LOG_FILE="$LOG_DIR/soql-enhancement.log"
    ERROR_PREVENTION_LOG_FILE="$LOG_DIR/error-prevention.log"
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
if command -v jq >/dev/null 2>&1 && echo "$TOOL_INPUT" | jq -e . >/dev/null 2>&1; then
    COMMAND="$(echo "$TOOL_INPUT" | jq -r '.command // empty' 2>/dev/null || echo "")"
fi
if [[ -z "$COMMAND" ]] && [[ "$TOOL_INPUT" =~ \"command\":[[:space:]]*\"([^\"]+)\" ]]; then
    COMMAND="${BASH_REMATCH[1]}"
else
    # Try extracting without JSON (direct command)
    if [[ -z "$COMMAND" ]]; then
        COMMAND="$TOOL_INPUT"
    fi
fi

# =============================================================================
# LIVE-FIRST MODE (v2.1.0)
# =============================================================================
# In live-first mode, org quirks are refreshed if they appear stale
# Controlled by GLOBAL_LIVE_FIRST or SOQL_LIVE_FIRST env vars
# Default: true (live-first behavior)

LIVE_FIRST="${SOQL_LIVE_FIRST:-${GLOBAL_LIVE_FIRST:-true}}"
QUIRKS_STALE_MINUTES="${QUIRKS_STALE_MINUTES:-60}"

# =============================================================================
# ERROR PREVENTION SYSTEM (New in v2.0.0)
# =============================================================================
# Intercept command for validation and auto-correction before enhancement

ERROR_PREVENTION_ENABLED=${ERROR_PREVENTION_ENABLED:-true}
if [[ "$ERROR_PREVENTION_ENABLED" == "true" ]]; then
    INTERCEPTOR="$PROJECT_ROOT/scripts/lib/sf-command-interceptor.js"
    ORIGINAL_HASH="$(hash_command "$COMMAND")"

    if [[ -f "$INTERCEPTOR" ]]; then
        INTERCEPTION_RESULT=$(node "$INTERCEPTOR" "$COMMAND" --dry-run --json 2>/dev/null || true)

        if [[ -n "$INTERCEPTION_RESULT" ]] && echo "$INTERCEPTION_RESULT" | jq -e . >/dev/null 2>&1; then
            IS_VALID=$(echo "$INTERCEPTION_RESULT" | jq -r '.valid // false')
            CORRECTED_COMMAND=$(echo "$INTERCEPTION_RESULT" | jq -r '.corrected // .original // empty')
            CORRECTIONS_COUNT=$(echo "$INTERCEPTION_RESULT" | jq -r '(.corrections // []) | length')
            ERRORS_COUNT=$(echo "$INTERCEPTION_RESULT" | jq -r '(.errors // []) | length')

            if [[ "$IS_VALID" == "true" ]]; then
                if [[ -n "$CORRECTED_COMMAND" ]]; then
                    COMMAND="$CORRECTED_COMMAND"
                fi

                UPDATED_HASH="$(hash_command "$COMMAND")"
                log_interceptor_event \
                    "validated" \
                    "$ORIGINAL_HASH" \
                    "$UPDATED_HASH" \
                    "valid=true corrections=$CORRECTIONS_COUNT errors=$ERRORS_COUNT"

                if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" ]]; then
                    safe_append_line "[$(date '+%Y-%m-%d %H:%M:%S')] Interceptor validated command" "$ERROR_PREVENTION_LOG_FILE"
                    safe_append_line "Corrections: $CORRECTIONS_COUNT | Errors: $ERRORS_COUNT" "$ERROR_PREVENTION_LOG_FILE"
                    if [[ "$ORIGINAL_HASH" != "$UPDATED_HASH" ]]; then
                        safe_append_line "Corrected command: $COMMAND" "$ERROR_PREVENTION_LOG_FILE"
                    fi
                fi
            else
                UPDATED_HASH="$(hash_command "$CORRECTED_COMMAND")"
                ERROR_MESSAGES=$(echo "$INTERCEPTION_RESULT" | jq -r '(.errors // [])[]?.message' 2>/dev/null | tr '\n' '; ' | sed 's/; $//')
                GUIDANCE=$(echo "$INTERCEPTION_RESULT" | jq -r '.guidance // empty')

                log_interceptor_event \
                    "blocked" \
                    "$ORIGINAL_HASH" \
                    "$UPDATED_HASH" \
                    "valid=false errors=$ERRORS_COUNT messages=$ERROR_MESSAGES"

                echo "❌ ERROR PREVENTION: Command blocked due to validation errors" >&2
                if [[ -n "$ERROR_MESSAGES" ]]; then
                    echo "$ERROR_MESSAGES" >&2
                fi
                if [[ -n "$GUIDANCE" && "$GUIDANCE" != "null" ]]; then
                    echo "$GUIDANCE" >&2
                fi
                exit 1
            fi
        else
            log_interceptor_event "interceptor_invalid_output" "$ORIGINAL_HASH" "$ORIGINAL_HASH" "Interceptor returned non-JSON output"
            verbose_log "[SOQL Enhancer] Interceptor returned invalid output; continuing without auto-correction."
        fi
    else
        log_interceptor_event "interceptor_missing" "$ORIGINAL_HASH" "$ORIGINAL_HASH" "Interceptor not found at $INTERCEPTOR"
        verbose_log "[SOQL Enhancer] Interceptor not found at $INTERCEPTOR"
    fi
fi

# Continue with existing SOQL enhancement logic only for query commands
if [[ ! "$COMMAND" =~ sf[[:space:]]+(data[[:space:]]+query|data:query) ]]; then
    # Not a query command, skip SOQL enhancement
    # Return command as-is (possibly corrected by error prevention)
    emit_command_output "$COMMAND"
    exit 0
fi

# Check if enhancement is enabled
ENHANCEMENT_ENABLED=${SOQL_ENHANCEMENT_ENABLED:-true}
if [[ "$ENHANCEMENT_ENABLED" != "true" ]]; then
    emit_command_output "$COMMAND"
    exit 0
fi

# Path to enhancement engine
ENHANCEMENT_ENGINE="$PROJECT_ROOT/scripts/lib/soql-enhancement-engine.js"

# Check if enhancement engine exists
if [[ ! -f "$ENHANCEMENT_ENGINE" ]]; then
    # Enhancement engine not found, return original
    verbose_log "[SOQL Enhancer] Enhancement engine not found at $ENHANCEMENT_ENGINE"
    emit_command_output "$COMMAND"
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
    emit_command_output "$COMMAND"
    exit 0
fi

# In live-first mode, check if org quirks are stale and warn
if [[ "$LIVE_FIRST" == "true" ]]; then
    QUIRKS_FILE="$PROJECT_ROOT/instances/$CURRENT_ORG/ORG_QUIRKS.json"
    if [[ -f "$QUIRKS_FILE" ]]; then
        QUIRKS_TIME=$(stat -c %Y "$QUIRKS_FILE" 2>/dev/null || stat -f %m "$QUIRKS_FILE" 2>/dev/null || echo 0)
        NOW=$(date +%s)
        QUIRKS_AGE_MINUTES=$(( (NOW - QUIRKS_TIME) / 60 ))

        if [[ "$QUIRKS_AGE_MINUTES" -gt "$QUIRKS_STALE_MINUTES" ]]; then
            if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" ]]; then
                safe_append_line "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Org quirks are ${QUIRKS_AGE_MINUTES} min old (threshold: ${QUIRKS_STALE_MINUTES})" "$ENHANCEMENT_LOG_FILE"
            fi
        fi
    fi
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
    emit_command_output "$COMMAND"
    exit 0
fi

# Log enhancement attempt (if logging enabled)
if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" ]]; then
    safe_append_line "[$(date '+%Y-%m-%d %H:%M:%S')] Enhancing query for org: $CURRENT_ORG" "$ENHANCEMENT_LOG_FILE"
    safe_append_line "Original: $SOQL_QUERY" "$ENHANCEMENT_LOG_FILE"
fi

# Call enhancement engine
ENHANCED_QUERY=""
if ENHANCED_QUERY=$(node "$ENHANCEMENT_ENGINE" enhance "$CURRENT_ORG" "$SOQL_QUERY" 2>/dev/null); then
    # Enhancement succeeded
    if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" ]]; then
        safe_append_line "Enhanced: $ENHANCED_QUERY" "$ENHANCEMENT_LOG_FILE"
    fi

    # Replace original query with enhanced query in command
    ENHANCED_COMMAND="${COMMAND//$SOQL_QUERY/$ENHANCED_QUERY}"

    # Return enhanced command in same format as input
    emit_command_output "$ENHANCED_COMMAND"
else
    # Enhancement failed, return latest validated/corrected command
    if [[ "${SOQL_ENHANCEMENT_LOG:-false}" == "true" ]]; then
        safe_append_line "Enhancement failed, using original query" "$ENHANCEMENT_LOG_FILE"
    fi
    emit_command_output "$COMMAND"
fi

exit 0
