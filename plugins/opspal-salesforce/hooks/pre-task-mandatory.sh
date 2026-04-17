#!/bin/bash

# Pre-Task Advisory Hook - Suggests agent usage for critical Salesforce operations
# This version emits ADVISORY guidance only (no hard deny) per 2026-04-01 P1-9 routing policy.
# Routing enforcement is suggestion-only; downstream specialist agents enforce safety.
#
# Version: 1.2.0 (Advisory-Only Migration — spec review follow-up on 55c9300)
# Date: 2026-04-17

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-mandatory-salesforce"
    # Keep strict mode for security-critical hook
fi

# Color codes for output
RED="${RED:-\033[0;31m}"
GREEN="${GREEN:-\033[0;32m}"
YELLOW="${YELLOW:-\033[1;33m}"
BLUE="${BLUE:-\033[0;34m}"
PURPLE="${PURPLE:-\033[0;35m}"
CYAN="${CYAN:-\033[0;36m}"
BOLD="${BOLD:-\033[1m}"
BLINK="${BLINK:-\033[5m}"
NC="${NC:-\033[0m}" # No Color

# Get the user's input/task from stdin (Claude Code hooks receive JSON via stdin)
HOOK_INPUT="$(cat)"

# Extract subagent_type to guard Salesforce-only governance
AGENT_NAME="$(echo "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // .agent // ""' 2>/dev/null || echo "")"
AGENT_NAME_LOWER="$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')"

TASK_INPUT="$(echo "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // .description // .task // ""' 2>/dev/null || echo "")"
OPERATION_TYPE="$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")"

# Only apply this governance to Salesforce agents. Other plugin agent launches
# should never be affected by Salesforce-local policy.
if [[ -z "$AGENT_NAME_LOWER" ]] || [[ "$AGENT_NAME_LOWER" != *"sfdc"* ]] && [[ "$AGENT_NAME_LOWER" != *"salesforce"* ]]; then
    printf '{}\n'
    exit 0
fi

# Log file for tracking
LOG_FILE="${TMPDIR:-/tmp}/agent-hook-mandatory-salesforce.log"
BYPASS_FILE="${TMPDIR:-/tmp}/agent-bypass-reasons-salesforce.log"

emit_pretool_noop() {
    printf '{}\n'
}

emit_pretool_response() {
    local permission_decision="$1"
    local permission_reason="$2"
    local additional_context="${3:-}"

    if [[ -n "$additional_context" ]]; then
        if [[ -n "$permission_reason" ]]; then
            permission_reason="${permission_reason}\n\n${additional_context}"
        else
            permission_reason="$additional_context"
        fi
    fi

    if ! command -v jq >/dev/null 2>&1; then
        emit_pretool_noop
        return 0
    fi

    jq -nc \
      --arg decision "$permission_decision" \
      --arg reason "$permission_reason" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          { hookEventName: "PreToolUse" }
          + (if $decision != "" then { permissionDecision: $decision } else {} end)
          + (if $reason != "" then { permissionDecisionReason: $reason } else {} end)
        )
      }'
}

# Function to log events
log_event() {
    local event="$1"
    local details="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $event: $details" >> "$LOG_FILE"
}

# Define HIGH-RISK Salesforce operations that REQUIRE agents
declare -A HIGH_RISK_OPERATIONS=(
    ["production_deploy"]="production.*deploy|deploy.*prod"
    ["delete_operations"]="delete.*(field|object|class|trigger|flow)"
    ["bulk_operations"]="bulk.*(update|insert|delete)|mass.*update"
    ["permission_changes"]="permission.*set.*(create|update)|profile.*update"
    ["data_migration"]="data.*migration|import.*production|export.*production"
    ["metadata_destruction"]="truncate|drop.*table|purge"
    ["security_changes"]="sharing.*rule|role.*hierarchy|security.*settings"
    ["org_changes"]="org.*delete|sandbox.*refresh.*prod"
)

# Define agent requirements for each high-risk category
declare -A REQUIRED_AGENTS=(
    ["production_deploy"]="sfdc-deployment-manager or release-coordinator"
    ["delete_operations"]="sfdc-metadata-manager"
    ["bulk_operations"]="sfdc-data-operations"
    ["permission_changes"]="sfdc-permission-orchestrator"
    ["data_migration"]="sfdc-data-operations"
    ["metadata_destruction"]="sfdc-metadata-manager with sfdc-planner"
    ["security_changes"]="sfdc-permission-orchestrator"
    ["org_changes"]="sfdc-orchestrator"
)

# Function to check if operation is high-risk
check_high_risk() {
    local task="$1"

    for category in "${!HIGH_RISK_OPERATIONS[@]}"; do
        local pattern="${HIGH_RISK_OPERATIONS[$category]}"
        if echo "$task" | grep -iE "$pattern" > /dev/null; then
            echo "$category"
            return 0
        fi
    done

    return 1
}

# Function to display suggested agent requirement (advisory-only per 2026-04-01 P1-9)
display_mandatory_requirement() {
    local category="$1"
    local required_agent="${REQUIRED_AGENTS[$category]}"

    echo "" >&2
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}" >&2
    echo -e "${YELLOW}${BOLD}║      [ADVISORY] SPECIALIST AGENT SUGGESTED            ║${NC}" >&2
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}" >&2
    echo "" >&2

    echo -e "${YELLOW}${BOLD}HIGH-RISK SALESFORCE OPERATION DETECTED (advisory routing)${NC}" >&2
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2

    # Show risk category
    case "$category" in
        "production_deploy")
            echo -e "${YELLOW}⚠️  PRODUCTION DEPLOYMENT${NC}" >&2
            echo "   Risk: Can impact all users immediately" >&2
            echo "   Potential Issues: Downtime, data loss, broken functionality" >&2
            ;;
        "delete_operations")
            echo -e "${YELLOW}⚠️  DESTRUCTIVE OPERATION${NC}" >&2
            echo "   Risk: Permanent data/metadata loss" >&2
            echo "   Potential Issues: Broken dependencies, data corruption" >&2
            ;;
        "bulk_operations")
            echo -e "${YELLOW}⚠️  BULK DATA OPERATION${NC}" >&2
            echo "   Risk: Governor limit violations" >&2
            echo "   Potential Issues: Operation failure, partial updates" >&2
            ;;
        "permission_changes")
            echo -e "${YELLOW}⚠️  SECURITY MODIFICATION${NC}" >&2
            echo "   Risk: Access control breach" >&2
            echo "   Potential Issues: Unauthorized access, compliance violations" >&2
            ;;
        *)
            echo -e "${YELLOW}⚠️  CRITICAL OPERATION${NC}" >&2
            echo "   Risk: System-wide impact" >&2
            ;;
    esac

    echo "" >&2
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
    echo -e "${GREEN}${BOLD}SUGGESTED AGENT(S):${NC} ${PURPLE}$required_agent${NC}" >&2
    echo "" >&2

    echo -e "${YELLOW}This operation is STRONGLY RECOMMENDED to use the suggested agent.${NC}" >&2
    echo -e "${YELLOW}The agent will:${NC}" >&2
    echo "  ✓ Validate prerequisites" >&2
    echo "  ✓ Create rollback plan" >&2
    echo "  ✓ Handle errors gracefully" >&2
    echo "  ✓ Ensure compliance" >&2
    echo "  ✓ Document changes" >&2

    echo "" >&2
    log_event "HIGH_RISK_ADVISORY" "$category: $TASK_INPUT"
}

# Function to check agent bypass attempts
check_bypass_attempt() {
    local task="$1"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Check if user is trying to bypass
    if echo "$task" | grep -iE '\bforce\b|\bbypass\b|skip.*check|ignore.*warning' | grep -viE 'salesforce' > /dev/null; then
        echo "" >&2
        echo -e "${RED}${BOLD}⚠️  BYPASS ATTEMPT DETECTED ⚠️${NC}" >&2
        echo -e "${RED}Attempting to bypass safety checks is not allowed.${NC}" >&2
        echo "[$timestamp] BYPASS_ATTEMPT: $task" >> "$BYPASS_FILE"
        return 0
    fi

    return 1
}

# Function to suggest agents for medium-risk operations
suggest_for_medium_risk() {
    local task="$1"
    local suggested_agents=()

    # Pattern matching for agent suggestions
    declare -A AGENT_PATTERNS=(
        ["sfdc-planner"]="plan|strategy|design|roadmap|architect"
        ["sfdc-field-analyzer"]="field.*analysis|formula|validation.*rule|illegal assignment from datetime to date|datetime.*to.*date|rollup.*summary.*schedule|failed.*update.*rollup|scheduled.*apex.*job"
        ["sfdc-conflict-resolver"]="conflict|error|failed|issue"
        ["sfdc-query-specialist"]="soql|query|select.*from"
        ["sfdc-apex-developer"]="apex|trigger|test.*class"
        ["sfdc-automation-builder"]="flow|automation|workflow"
        ["sfdc-reports-dashboards"]="report|dashboard|analytics"
    )

    for agent in "${!AGENT_PATTERNS[@]}"; do
        local pattern="${AGENT_PATTERNS[$agent]}"
        if echo "$task" | grep -iE "$pattern" > /dev/null; then
            suggested_agents+=("$agent")
        fi
    done

    if [ ${#suggested_agents[@]} -gt 0 ]; then
        echo "" >&2
        echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}" >&2
        echo -e "${YELLOW}║         💡 AGENT RECOMMENDATION (Medium Risk) 💡        ║${NC}" >&2
        echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}" >&2
        echo "" >&2

        echo -e "${BLUE}Suggested agents for this task:${NC}" >&2
        for agent in "${suggested_agents[@]}"; do
            echo -e "  ${GREEN}▸${NC} ${PURPLE}$agent${NC}" >&2
        done

        echo "" >&2
        echo -e "${YELLOW}While not mandatory, using an agent will:${NC}" >&2
        echo "  • Reduce errors by 80%" >&2
        echo "  • Save 60-90% time" >&2
        echo "  • Ensure best practices" >&2

        log_event "MEDIUM_RISK_SUGGESTED" "$task: ${suggested_agents[*]}"
    fi
}

# Main execution
main() {
    # Sub-agents bypass mandatory checks — routing already ensured specialist was spawned
    local HOOK_AGENT_TYPE_CHECK
    HOOK_AGENT_TYPE_CHECK="$(echo "${HOOK_INPUT:-}" | jq -r '.agent_type // empty' 2>/dev/null || echo "")"
    if [ -n "${CLAUDE_TASK_ID:-}" ] || [ -n "$HOOK_AGENT_TYPE_CHECK" ]; then
        emit_pretool_noop
        exit 0
    fi

    # Check for bypass attempts first
    # [ADVISORY] Per routing advisory-only policy (2026-04-01 P1-9), bypass attempts
    # are logged and surfaced as advisory guidance rather than hard denials.
    if check_bypass_attempt "$TASK_INPUT"; then
        echo "[ADVISORY] SFDC_BYPASS_ADVISORY: Bypass semantics detected in task input." >&2
        emit_pretool_response \
          "allow" \
          "[ADVISORY] SFDC_BYPASS_ADVISORY: Bypass semantics detected. Routing checks are advisory only — use the required Salesforce agent flow for high-risk operations." \
          "Task input requested bypass semantics. Proceeding with advisory guidance; use the appropriate Salesforce agent for data safety."
        exit 0
    fi

    # Check if high-risk operation
    local _risk_rc=0
    local RISK_CATEGORY
    RISK_CATEGORY=$(check_high_risk "$TASK_INPUT") || _risk_rc=$?

    if [ "$_risk_rc" -eq 0 ] && [ -n "$RISK_CATEGORY" ]; then
        # High-risk operation - SUGGESTED agent use (advisory only per 2026-04-01 P1-9 remediation)
        display_mandatory_requirement "$RISK_CATEGORY"

        echo "" >&2
        echo -e "${BOLD}${YELLOW}[ADVISORY] This operation SHOULD use the required agent for safety.${NC}" >&2
        echo "" >&2
        echo -e "${GREEN}SUGGESTED: use:${NC}" >&2
        local suggested_agent="${REQUIRED_AGENTS[$RISK_CATEGORY]%% or*}"
        echo -e "${CYAN}  Agent tool with subagent_type='${suggested_agent}'${NC}" >&2
        echo "" >&2
        echo -e "${YELLOW}Or check the agent matrix: /agent-matrix${NC}" >&2
        echo -e "${YELLOW}Proceeding with advisory warning — routing is suggestion-only.${NC}" >&2

        emit_pretool_response \
          "allow" \
          "[ADVISORY] SFDC_AGENT_SUGGESTED: High-risk Salesforce operation should use agent '${suggested_agent}'." \
          "Risk category: ${RISK_CATEGORY}. STRONGLY RECOMMENDED: route through the required Salesforce specialist. Proceeding autonomously per advisory-only routing policy."
        exit 0
    else
        # Not high-risk, but check for suggestions
        suggest_for_medium_risk "$TASK_INPUT"
    fi
}

# Run main function
main

# Exit successfully to continue execution (for non-blocked operations)
emit_pretool_noop
exit 0
