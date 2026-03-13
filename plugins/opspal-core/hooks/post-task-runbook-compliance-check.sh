#!/bin/bash
#
# Post-Task Runbook Compliance Check Hook
#
# Purpose: Verify that operational agents respected runbook policies
#          in their field selections. Logs compliance status and
#          emits traces for audit.
#
# Part of the Runbook Policy Infrastructure (Phase 3).
#
# Behavior:
#   1. Check if task had an injected runbook_policy
#   2. Extract field selection from task output (if available)
#   3. Compare against policy requirements
#   4. Log compliance status
#   5. Emit execution trace (if tracing enabled)
#
# Configuration:
#   RUNBOOK_COMPLIANCE_ENABLED=1     - Enable/disable check (default: 1)
#   RUNBOOK_COMPLIANCE_VERBOSE=0     - Enable verbose logging (default: 0)
#   RUNBOOK_COMPLIANCE_LOG=1         - Log compliance events (default: 1)
#
# Version: 1.0.0
# Date: 2026-02-02
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Plugin root detection
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
else
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Configuration
ENABLED="${RUNBOOK_COMPLIANCE_ENABLED:-1}"
VERBOSE="${RUNBOOK_COMPLIANCE_VERBOSE:-0}"
LOG_ENABLED="${RUNBOOK_COMPLIANCE_LOG:-1}"

# Log file location
LOG_DIR="${HOME}/.claude/logs/runbook-compliance"
LOG_FILE="${LOG_DIR}/compliance-$(date +%Y-%m-%d).jsonl"

# Read hook input
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat)
fi

# Early exit if disabled
if [ "$ENABLED" = "0" ]; then
    exit 0
fi

# ============================================================================
# Functions
# ============================================================================

log_verbose() {
    if [ "$VERBOSE" = "1" ]; then
        echo "[runbook-compliance] $1" >&2
    fi
}

log_info() {
    echo "[runbook-compliance] $1" >&2
}

ensure_log_dir() {
    if [ ! -d "$LOG_DIR" ]; then
        mkdir -p "$LOG_DIR"
    fi
}

# Log compliance event
log_compliance_event() {
    local status="$1"
    local org="$2"
    local object="$3"
    local task_type="$4"
    local details="$5"

    if [ "$LOG_ENABLED" != "1" ]; then
        return 0
    fi

    ensure_log_dir

    local event
    event=$(jq -nc \
        --arg status "$status" \
        --arg org "$org" \
        --arg object "$object" \
        --arg task_type "$task_type" \
        --arg details "$details" \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            timestamp: $timestamp,
            event_type: "runbook_compliance_check",
            status: $status,
            org: $org,
            object: $object,
            task_type: $task_type,
            details: $details
        }' 2>/dev/null || echo "")

    if [ -n "$event" ]; then
        echo "$event" >> "$LOG_FILE"
    fi
}

# Check compliance
check_compliance() {
    local input="$1"

    if ! command -v jq &>/dev/null; then
        log_verbose "jq not available, skipping compliance check"
        return 0
    fi

    # Check if runbook_policy was injected
    local has_policy
    has_policy=$(echo "$input" | jq -r 'has("runbook_policy")' 2>/dev/null || echo "false")

    if [ "$has_policy" != "true" ]; then
        log_verbose "No runbook policy in task context"
        return 0
    fi

    # Extract policy details
    local policy_status
    policy_status=$(echo "$input" | jq -r '.runbook_policy.status // "unknown"' 2>/dev/null || echo "unknown")

    local org
    org=$(echo "$input" | jq -r '.sf_org_context.detected_org // .org // ""' 2>/dev/null || echo "")

    local object
    object=$(echo "$input" | jq -r '.runbook_policy.task_variant.variant_id // ""' 2>/dev/null || echo "")

    # Get required fields from policy
    local required_fields
    required_fields=$(echo "$input" | jq -r '.runbook_policy.field_policy.required_fields // []' 2>/dev/null || echo "[]")

    # Get prohibited fields
    local prohibited_fields
    prohibited_fields=$(echo "$input" | jq -r '.runbook_policy.field_policy.prohibited_fields // []' 2>/dev/null || echo "[]")

    # Try to find field selection in output (if task captured it)
    local selected_fields
    selected_fields=$(echo "$input" | jq -r '.task_output.fields_selected // .fields_selected // []' 2>/dev/null || echo "[]")

    # Compliance checks
    local compliance_issues=()

    # Check 1: Policy was found
    if [ "$policy_status" = "escalated" ]; then
        compliance_issues+=("Policy was escalated (not found)")
    fi

    # Check 2: All required fields included (if we have selected fields info)
    if [ "$selected_fields" != "[]" ] && [ "$required_fields" != "[]" ]; then
        local missing_required
        missing_required=$(echo "$required_fields" | jq --argjson selected "$selected_fields" '
            . - $selected | if length > 0 then . else empty end
        ' 2>/dev/null || echo "")

        if [ -n "$missing_required" ] && [ "$missing_required" != "null" ]; then
            compliance_issues+=("Missing required fields: $missing_required")
        fi
    fi

    # Check 3: No prohibited fields included
    if [ "$selected_fields" != "[]" ] && [ "$prohibited_fields" != "[]" ]; then
        local included_prohibited
        included_prohibited=$(echo "$prohibited_fields" | jq --argjson selected "$selected_fields" '
            . as $prohibited | $selected | map(select(. as $f | $prohibited | contains([$f])))
            | if length > 0 then . else empty end
        ' 2>/dev/null || echo "")

        if [ -n "$included_prohibited" ] && [ "$included_prohibited" != "null" ]; then
            compliance_issues+=("Prohibited fields included: $included_prohibited")
        fi
    fi

    # Determine compliance status
    local status="compliant"
    local details="Policy found and respected"

    if [ ${#compliance_issues[@]} -gt 0 ]; then
        status="non_compliant"
        details=$(printf '%s; ' "${compliance_issues[@]}")
        log_info "⚠️  Compliance issues detected: $details"
    else
        log_verbose "✅ Compliance check passed"
    fi

    # Get task_type from policy
    local task_type
    task_type=$(echo "$input" | jq -r '.runbook_policy.task_variant.variant_id // "unknown"' 2>/dev/null || echo "unknown")

    # Log the event
    log_compliance_event "$status" "$org" "$object" "$task_type" "$details"

    return 0
}

# ============================================================================
# Main Logic
# ============================================================================

# Check if we have input
if [ -z "$HOOK_INPUT" ]; then
    log_verbose "No input received"
    exit 0
fi

# Run compliance check
check_compliance "$HOOK_INPUT"

exit 0
