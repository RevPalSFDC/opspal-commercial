#!/usr/bin/env bash
#
# Task Graph Policy Enforcer Hook
# Enforces tool policies based on task risk level and domain
#
# This hook is triggered before tool execution to:
# 1. Check if tool is allowed for current task risk level
# 2. Block forbidden operations
# 3. Request approval for restricted operations
# 4. Log tool usage for audit trail
#
# Exit codes:
#   0 - Allow operation
#   1 - Error (allow operation, log warning)
#   2 - Block operation, request approval
#   3 - Forbidden operation, hard block

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${SCRIPT_DIR}/.."
CONFIG_PATH="${PLUGIN_ROOT}/config/tool-policies.json"
PROJECT_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
DEFAULT_LOG_ROOT="${PROJECT_ROOT}/.claude/logs"
LOG_ROOT="${CLAUDE_HOOK_LOG_ROOT:-$DEFAULT_LOG_ROOT}"
FALLBACK_LOG_ROOT="/tmp/.claude/logs"
LOG_DIR=""
LOG_FILE=""

resolve_log_dir() {
    local primary="${LOG_ROOT}/task-graph"
    local fallback="${FALLBACK_LOG_ROOT}/task-graph"

    if mkdir -p "$primary" 2>/dev/null; then
        echo "$primary"
        return 0
    fi

    if mkdir -p "$fallback" 2>/dev/null; then
        echo "$fallback"
        return 0
    fi

    echo ""
    return 1
}

safe_append_log() {
    local line="$1"
    if [ -z "$LOG_FILE" ]; then
        return 0
    fi
    printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
}

LOG_DIR="$(resolve_log_dir || true)"
if [ -n "$LOG_DIR" ]; then
    LOG_FILE="${LOG_DIR}/policy-enforcement.jsonl"
fi

# Read tool info from stdin (Claude passes JSON via stdin for PreToolUse hooks)
INPUT_JSON=""
TOOL_ARGS_FROM_STDIN=""
if [ -z "${1:-}" ] && [ -z "${CLAUDE_TOOL_NAME:-}" ] && [ ! -t 0 ]; then
    INPUT_JSON=$(cat 2>/dev/null || true)
fi

# Extract tool name from stdin JSON, then fall back to env/args
if [ -n "$INPUT_JSON" ] && command -v jq &>/dev/null; then
    TOOL_NAME=$(echo "$INPUT_JSON" | jq -r '.tool_name // empty' 2>/dev/null || true)
    TOOL_ARGS_FROM_STDIN=$(echo "$INPUT_JSON" | jq -r '
        if .tool_name == "Bash" then (.tool_input.command // "")
        else (.tool_input // {} | @json)
        end
    ' 2>/dev/null || true)
fi
TOOL_NAME="${TOOL_NAME:-${1:-${CLAUDE_TOOL_NAME:-unknown}}}"
TOOL_ARGS="${2:-${CLAUDE_TOOL_ARGS:-${TOOL_ARGS_FROM_STDIN:-}}}"
TASK_CONTEXT="${CLAUDE_TASK_CONTEXT:-}"

# Extract task information
get_task_info() {
    if [[ -n "$TASK_CONTEXT" ]] && command -v jq &>/dev/null; then
        TASK_ID=$(echo "$TASK_CONTEXT" | jq -r '.id // "unknown"')
        TASK_DOMAIN=$(echo "$TASK_CONTEXT" | jq -r '.domain // "unknown"')
        RISK_LEVEL=$(echo "$TASK_CONTEXT" | jq -r '.risk_level // "medium"')
        TOOL_POLICY=$(echo "$TASK_CONTEXT" | jq -r '.tool_policy // {}')
    else
        TASK_ID="unknown"
        TASK_DOMAIN="unknown"
        RISK_LEVEL="unmanaged"
        TOOL_POLICY="{}"
    fi
}

# Log policy decision
log_decision() {
    local decision="$1"
    local reason="$2"

    if command -v jq &>/dev/null; then
        local entry
        entry=$(jq -nc \
            --arg timestamp "$(date -Iseconds)" \
            --arg task_id "$TASK_ID" \
            --arg tool "$TOOL_NAME" \
            --arg risk_level "$RISK_LEVEL" \
            --arg decision "$decision" \
            --arg reason "$reason" \
            '{timestamp: $timestamp, task_id: $task_id, tool: $tool, risk_level: $risk_level, decision: $decision, reason: $reason}' 2>/dev/null || true)
        if [ -n "$entry" ]; then
            safe_append_log "$entry"
        fi
    fi
}

is_opspal_runtime_maintenance_command() {
    if [[ "$TOOL_NAME" != "Bash" ]] || [[ -z "$TOOL_ARGS" ]]; then
        return 1
    fi

    local args_lower
    args_lower="$(printf '%s' "$TOOL_ARGS" | tr '[:upper:]' '[:lower:]')"

    case "$args_lower" in
        *plugin-update-manager.js*|\
        *post-plugin-update-fixes.js*|\
        *reconcile-hook-registration.js*|\
        *routing-index-builder.js*|\
        *hook-health-checker.js*|\
        *routing-state-manager.js*|\
        *validate-routing.sh*|\
        *project-connect-schema-migrate.js*|\
        *project-connect-sync-all.sh*|\
        *scheduler-manager.js*)
            ;;
        *)
            return 1
            ;;
    esac

    if [[ "$args_lower" == *".claude"* ]] || \
       [[ "$args_lower" == *"settings.json"* ]] || \
       [[ "$args_lower" == *"plugins/cache"* ]] || \
       [[ "$args_lower" == *"plugins/marketplaces"* ]] || \
       [[ "$args_lower" == *"routing-state.json"* ]] || \
       [[ "$args_lower" == *"circuit-breaker"* ]] || \
       [[ "$args_lower" == *"routing-vector-cache.json"* ]]; then
        return 0
    fi

    return 1
}

# Check if tool is in allowed list for risk level
check_allowed_tools() {
    local risk="$1"

    if [[ ! -f "$CONFIG_PATH" ]] || ! command -v jq &>/dev/null; then
        return 0  # Allow if config not available
    fi

    local allowed_tools
    allowed_tools=$(jq -r ".policies.${risk}.allowed_tools[]?" "$CONFIG_PATH" 2>/dev/null | tr '\n' '|')

    if [[ -z "$allowed_tools" ]]; then
        return 0  # Allow if no restrictions defined
    fi

    # Check if tool matches any allowed pattern
    if echo "$TOOL_NAME" | grep -qE "^(${allowed_tools%|})$"; then
        return 0
    fi

    return 1
}

# Check for forbidden patterns in tool arguments
check_forbidden_patterns() {
    if [[ ! -f "$CONFIG_PATH" ]] || ! command -v jq &>/dev/null; then
        return 0
    fi

    # Get blocked patterns for Bash commands
    if [[ "$TOOL_NAME" == "Bash" ]]; then
        local blocked_patterns
        blocked_patterns=$(jq -r '.tool_classifications.execute.special_handling.Bash.blocked_patterns[]?' "$CONFIG_PATH" 2>/dev/null)

        while IFS= read -r pattern; do
            if [[ -n "$pattern" ]] && echo "$TOOL_ARGS" | grep -qE "$pattern"; then
                echo "BLOCKED: Matches forbidden pattern: $pattern"
                return 1
            fi
        done <<< "$blocked_patterns"
    fi

    return 0
}

# Check for patterns requiring approval
check_approval_required() {
    if [[ ! -f "$CONFIG_PATH" ]] || ! command -v jq &>/dev/null; then
        return 1  # No approval needed if can't check
    fi

    # Get approval-required patterns for Bash commands
    if [[ "$TOOL_NAME" == "Bash" ]]; then
        local approval_patterns
        approval_patterns=$(jq -r '.tool_classifications.execute.special_handling.Bash.requires_approval_patterns[]?' "$CONFIG_PATH" 2>/dev/null)

        while IFS= read -r pattern; do
            if [[ -n "$pattern" ]] && echo "$TOOL_ARGS" | grep -qE "$pattern"; then
                echo "APPROVAL_REQUIRED: Matches pattern: $pattern"
                return 0
            fi
        done <<< "$approval_patterns"
    fi

    return 1
}

# Check for production indicators
check_production_access() {
    if [[ ! -f "$CONFIG_PATH" ]] || ! command -v jq &>/dev/null; then
        return 1
    fi

    # Check Salesforce production patterns
    local sf_prod_patterns
    sf_prod_patterns=$(jq -r '.escalation_rules.production_detection.salesforce.org_patterns[]?' "$CONFIG_PATH" 2>/dev/null)

    while IFS= read -r pattern; do
        if [[ -n "$pattern" ]] && echo "$TOOL_ARGS" | grep -qiE "(--target-org|--username|-u).*$pattern"; then
            echo "PRODUCTION_DETECTED: Salesforce production org pattern: $pattern"
            return 0
        fi
    done <<< "$sf_prod_patterns"

    return 1
}

# Check destructive operations
# Platform-specific CLI operations (sf flow delete, sf data delete, REST API DELETE)
# are governed by their own platform hooks (pre-deploy-agent-context-check,
# universal-agent-governance, etc.) and should not be caught by generic keyword matching.
check_destructive_ops() {
    local args_lower
    args_lower="$(printf '%s' "$TOOL_ARGS" | tr '[:upper:]' '[:lower:]')"

    # Salesforce CLI operations are platform-managed, not generic destructive
    case "$args_lower" in
        *"sf flow delete"*|*"sf project deploy"*"destructive"*|\
        *"sf api request rest"*"--method delete"*|*"sf api request rest"*"-x delete"*|\
        *"sf data delete record"*|*"sf data bulk delete"*|\
        *"sfdx force:data:record:delete"*|*"sfdx force:source:delete"*|\
        *"sf sobject delete"*)
            return 1
            ;;
    esac

    # Generic destructive operations still need review
    if echo "$TOOL_ARGS" | grep -qiE "rm -rf|rmdir.*-p|DROP TABLE|TRUNCATE TABLE|destroy|purge"; then
        echo "DESTRUCTIVE_OP: Contains destructive pattern"
        return 0
    fi

    # Hard-delete is always flagged (irreversible)
    if echo "$TOOL_ARGS" | grep -qiE "hard-delete"; then
        echo "DESTRUCTIVE_OP: Contains hard-delete keyword"
        return 0
    fi

    return 1
}

# Main policy enforcement logic
main() {
    get_task_info

    # Skip enforcement for read-only tools
    case "$TOOL_NAME" in
        Read|Grep|Glob|LSP|WebSearch)
            log_decision "allow" "read_only_tool"
            exit 0
            ;;
    esac

    if is_opspal_runtime_maintenance_command; then
        log_decision "allow" "opspal_runtime_maintenance"
        exit 0
    fi

    # Check forbidden patterns first (hard block)
    local forbidden_result
    forbidden_result=$(check_forbidden_patterns 2>&1) || {
        log_decision "block" "$forbidden_result"
        echo "❌ $forbidden_result" >&2
        exit 3
    }

    # Check if tool is allowed for risk level
    if ! check_allowed_tools "$RISK_LEVEL"; then
        if [[ "$RISK_LEVEL" == "critical" ]]; then
            log_decision "block" "tool_not_allowed_for_critical"
            echo "❌ BLOCKED: Tool '$TOOL_NAME' not allowed for critical risk tasks" >&2
            exit 3
        else
            log_decision "approval_required" "tool_requires_approval"
            echo "⚠️ APPROVAL_REQUIRED: Tool '$TOOL_NAME' requires approval for $RISK_LEVEL risk tasks" >&2
            exit 2
        fi
    fi

    # Check for production access
    local prod_result
    if prod_result=$(check_production_access 2>&1); then
        if [[ "$RISK_LEVEL" != "critical" ]]; then
            log_decision "escalate" "$prod_result"
            echo "⚠️ ESCALATE: $prod_result - Task should be escalated to critical risk" >&2
            exit 2
        fi
    fi

    # Check for destructive operations
    local destruct_result
    if destruct_result=$(check_destructive_ops 2>&1); then
        case "$RISK_LEVEL" in
            low|medium)
                log_decision "approval_required" "$destruct_result"
                echo "⚠️ APPROVAL_REQUIRED: $destruct_result - Destructive operations require approval" >&2
                exit 2
                ;;
            high|unmanaged)
                log_decision "warn" "$destruct_result"
                echo "⚠️ WARNING: $destruct_result" >&2
                ;;
        esac
    fi

    # Check for patterns requiring approval
    local approval_result
    if approval_result=$(check_approval_required 2>&1); then
        case "$RISK_LEVEL" in
            low|medium)
                log_decision "approval_required" "$approval_result"
                echo "⚠️ $approval_result" >&2
                exit 2
                ;;
            high|unmanaged)
                log_decision "warn" "$approval_result"
                echo "⚠️ $approval_result" >&2
                ;;
        esac
    fi

    # All checks passed
    log_decision "allow" "all_checks_passed"
    exit 0
}

# Run main function
main "$@"
