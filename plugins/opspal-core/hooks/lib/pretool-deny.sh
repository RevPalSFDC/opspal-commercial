#!/usr/bin/env bash
# =============================================================================
# Standardized PreToolUse Deny Output Library
# =============================================================================
#
# Purpose: Provides a consistent structured deny output format for all hooks
# that block tool execution. Ensures agents receive machine-parseable error
# codes, per-file breakdowns, and actionable recovery hints.
#
# Version: 1.0.0
# Created: 2026-03-21
#
# Usage: Source this file in any PreToolUse hook, then call emit_structured_deny:
#
#   source "${SCRIPT_DIR}/lib/pretool-deny.sh" 2>/dev/null || true
#
#   emit_structured_deny \
#     "FLOW_VALIDATION_FAILED" \
#     "Flow validation failed: 3 logic error(s)" \
#     "Fix logic errors or set SKIP_FLOW_VALIDATION=1." \
#     "$PER_FILE_JSON"
#
# =============================================================================

# Output fd — hooks that redirect stdout (exec 3>&1 1>&2) set PRETOOL_DENY_FD=3
PRETOOL_DENY_FD="${PRETOOL_DENY_FD:-1}"

# emit_structured_deny - Structured deny response for PreToolUse hooks
#
# Args:
#   $1 - errorCode (machine-parseable, e.g. FLOW_VALIDATION_FAILED)
#   $2 - permissionDecisionReason (human-readable summary)
#   $3 - recoveryHints (actionable next steps)
#   $4 - affectedFiles (optional, JSON array or empty)
#   $5 - additionalContext (optional, extra context)
#
emit_structured_deny() {
    local error_code="${1:?emit_structured_deny requires errorCode}"
    local reason="${2:?emit_structured_deny requires reason}"
    local hints="${3:-}"
    local affected_files="${4:-}"
    local extra_context="${5:-}"

    local context_parts=""
    [ -n "$error_code" ] && context_parts="errorCode=${error_code}."
    [ -n "$hints" ] && context_parts="${context_parts} ${hints}"
    [ -n "$extra_context" ] && context_parts="${context_parts} ${extra_context}"

    if [ -n "$affected_files" ] && echo "$affected_files" | jq -e . >/dev/null 2>&1; then
        jq -n \
            --arg reason "$reason" \
            --arg context "$context_parts" \
            --arg code "$error_code" \
            --arg hints "$hints" \
            --argjson files "$affected_files" \
            '{
                suppressOutput: true,
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: $reason,
                    additionalContext: $context,
                    errorCode: $code,
                    recoveryHints: $hints,
                    affectedFiles: $files
                }
            }' >&"$PRETOOL_DENY_FD"
    else
        jq -n \
            --arg reason "$reason" \
            --arg context "$context_parts" \
            --arg code "$error_code" \
            --arg hints "$hints" \
            '{
                suppressOutput: true,
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: $reason,
                    additionalContext: $context,
                    errorCode: $code,
                    recoveryHints: $hints
                }
            }' >&"$PRETOOL_DENY_FD"
    fi
}

# emit_structured_warn - Non-blocking warning for PreToolUse hooks
#
# Args:
#   $1 - warningCode (machine-parseable)
#   $2 - additionalContext (warning message)
#
emit_structured_warn() {
    local warn_code="${1:?emit_structured_warn requires warningCode}"
    local context="${2:?emit_structured_warn requires context}"

    jq -n \
        --arg context "WARNING [${warn_code}]: ${context}" \
        '{
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                additionalContext: $context
            }
        }' >&"$PRETOOL_DENY_FD"
}
