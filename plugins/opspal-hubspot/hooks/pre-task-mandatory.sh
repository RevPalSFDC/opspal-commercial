#!/usr/bin/env bash
set -euo pipefail

# Pre-Task Advisory Hook - Suggests agent usage for critical HubSpot operations
# This version emits ADVISORY guidance only (no hard deny) per 2026-04-01 P1-9 routing policy.
# Routing enforcement is suggestion-only; downstream specialist agents enforce safety.
#
# Version: 1.2.0 (Advisory-Only Migration — reflection 9e6373b8)
# Date: 2026-04-17

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "DEBUG: [pre-task-mandatory] starting" >&2
fi

# Source error handler — try plugin-local lib first, then resolve core plugin
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_EH="${SCRIPT_DIR}/lib/error-handler.sh"
if [[ ! -f "$_EH" ]]; then
    for _candidate in \
        "${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh" \
        "${CLAUDE_PLUGIN_ROOT:-/nonexistent}/opspal-core/hooks/lib/error-handler.sh" \
        "$HOME/.claude/plugins/marketplaces/opspal-commercial/plugins/opspal-core/hooks/lib/error-handler.sh"; do
        if [[ -f "$_candidate" ]]; then _EH="$_candidate"; break; fi
    done
fi
[[ -f "$_EH" ]] && source "$_EH"
unset _EH _candidate
HOOK_NAME="pre-task-mandatory-hubspot"
# Keep strict mode for security-critical hook

# Color codes for output
: "${RED:=\033[0;31m}"
: "${GREEN:=\033[0;32m}"
: "${YELLOW:=\033[1;33m}"
: "${BLUE:=\033[0;34m}"
: "${PURPLE:=\033[0;35m}"
: "${CYAN:=\033[0;36m}"
: "${BOLD:=\033[1m}"
: "${BLINK:=\033[5m}"
: "${NC:=\033[0m}" # No Color

# Get the user's input/task
TASK_INPUT="${1:-}"
OPERATION_TYPE="${2:-unknown}"
BLOCK_EXIT_CODE="${HOOK_BLOCK_EXIT_CODE:-2}"
AGENT_NAME="${AGENT_NAME:-}"

HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

if [[ -z "$TASK_INPUT" ]] && [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    TASK_INPUT=$(echo "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // .description // .task // ""' 2>/dev/null || echo "")
fi

if [[ -z "$AGENT_NAME" ]] && [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .subagent_type // .agent // ""' 2>/dev/null || echo "")
fi

AGENT_NAME_LOWER="$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')"

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

# Only apply this governance to HubSpot agents. Other plugin agent launches
# should never be blocked by HubSpot-local policy.
if [[ -z "$AGENT_NAME_LOWER" ]] || [[ "$AGENT_NAME_LOWER" != *"hubspot"* ]]; then
    emit_pretool_noop
    exit 0
fi

# Log file for tracking
LOG_FILE="/tmp/agent-hook-mandatory-hubspot.log"
BYPASS_FILE="/tmp/agent-bypass-reasons-hubspot.log"

# Function to log events
log_event() {
    local event="$1"
    local details="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $event: $details" >> "$LOG_FILE"
}

# Define HIGH-RISK HubSpot operations that REQUIRE agents
# bash 4+ required for associative arrays
if ((BASH_VERSINFO[0] < 4)); then
    emit_pretool_noop
    exit 0
fi

declare -A HIGH_RISK_OPERATIONS=(
    ["production_workflow"]="production.*workflow|workflow.*production|activate.*workflow"
    ["delete_operations"]="delete.*(workflow|property|contact|company|deal)"
    ["bulk_operations"]="bulk.*(update|import|delete).*contact|mass.*contact.*update"
    ["integration_setup"]="integration.*(setup|configure)|webhook.*create|api.*key"
    ["data_migration"]="data.*migration|import.*production|export.*production"
    ["workflow_destruction"]="delete.*workflow|deactivate.*all|purge.*workflow"
    ["property_deletion"]="delete.*property|remove.*field"
    ["portal_changes"]="portal.*delete|portal.*reset|clear.*all.*data"
)

# Define agent requirements for each high-risk category
declare -A REQUIRED_AGENTS=(
    ["production_workflow"]="hubspot-workflow-builder"
    ["delete_operations"]="hubspot-orchestrator"
    ["bulk_operations"]="hubspot-data-operations-manager"
    ["integration_setup"]="hubspot-integration-specialist"
    ["data_migration"]="hubspot-data-operations-manager"
    ["workflow_destruction"]="hubspot-workflow-builder with hubspot-orchestrator"
    ["property_deletion"]="hubspot-property-manager"
    ["portal_changes"]="hubspot-orchestrator with hubspot-admin-specialist"
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

    echo -e "${YELLOW}${BOLD}HIGH-RISK HUBSPOT OPERATION DETECTED (advisory routing)${NC}" >&2
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2

    # Show risk category
    case "$category" in
        "production_workflow")
            echo -e "${YELLOW}⚠️  PRODUCTION WORKFLOW MODIFICATION${NC}" >&2
            echo "   Risk: Can impact active campaigns and automations" >&2
            echo "   Potential Issues: Broken automation, incorrect enrollments" >&2
            ;;
        "delete_operations")
            echo -e "${YELLOW}⚠️  DESTRUCTIVE OPERATION${NC}" >&2
            echo "   Risk: Permanent data/configuration loss" >&2
            echo "   Potential Issues: Lost contacts, broken workflows, data corruption" >&2
            ;;
        "bulk_operations")
            echo -e "${YELLOW}⚠️  BULK DATA OPERATION${NC}" >&2
            echo "   Risk: API rate limits, data corruption" >&2
            echo "   Potential Issues: Partial updates, duplicate records, rate limiting" >&2
            ;;
        "integration_setup")
            echo -e "${YELLOW}⚠️  INTEGRATION CONFIGURATION${NC}" >&2
            echo "   Risk: Data sync issues, authentication failures" >&2
            echo "   Potential Issues: Broken integrations, data loss, security exposure" >&2
            ;;
        "data_migration")
            echo -e "${YELLOW}⚠️  DATA MIGRATION${NC}" >&2
            echo "   Risk: Large-scale data corruption" >&2
            echo "   Potential Issues: Data loss, incorrect mappings, broken associations" >&2
            ;;
        *)
            echo -e "${YELLOW}⚠️  CRITICAL OPERATION${NC}" >&2
            echo "   Risk: Portal-wide impact" >&2
            ;;
    esac

    echo "" >&2
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
    echo -e "${GREEN}${BOLD}SUGGESTED AGENT(S):${NC} ${PURPLE}$required_agent${NC}" >&2
    echo "" >&2

    echo -e "${YELLOW}This operation is STRONGLY RECOMMENDED to use the suggested agent.${NC}" >&2
    echo -e "${YELLOW}The agent will:${NC}" >&2
    echo "  ✓ Validate prerequisites and portal state" >&2
    echo "  ✓ Check API rate limits" >&2
    echo "  ✓ Create rollback plan" >&2
    echo "  ✓ Handle pagination correctly" >&2
    echo "  ✓ Ensure data integrity" >&2
    echo "  ✓ Document changes" >&2

    echo "" >&2
    log_event "HIGH_RISK_ADVISORY" "$category: $TASK_INPUT"
}

# Function to check agent bypass attempts
check_bypass_attempt() {
    local task="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Check if user is trying to bypass
    local bypass_pattern='(^|[[:space:][:punct:]])(bypass|skip([[:space:]-]+(the[[:space:]-]+)?)?checks?|ignore([[:space:]-]+(the[[:space:]-]+)?)?warnings?|override([[:space:]-]+(the[[:space:]-]+)?)?(checks?|gate|guardrail)|force[[:space:]-]+(it|this|execution|run|deploy|merge|delete)|without[[:space:]-]+(checks?|validation|approval))($|[[:space:][:punct:]])'
    if echo "$task" | grep -iE "$bypass_pattern" > /dev/null; then
        echo "" >&2
        echo -e "${RED}${BOLD}⚠️  BYPASS ATTEMPT DETECTED ⚠️${NC}" >&2
        echo -e "${RED}Attempting to bypass safety checks is not allowed.${NC}" >&2
        echo "[$timestamp] BYPASS_ATTEMPT: $task" >> "$BYPASS_FILE"
        return 0
    fi

    return 1
}

# Medium-risk agent suggestions moved to CLAUDE.md (opspal-hubspot).
# The routing table there covers workflow→hubspot-workflow-builder,
# contact→hubspot-contact-manager, etc. without per-prompt shell overhead.

# Main execution
main() {
    # Check for bypass attempts first
    # [ADVISORY] Per routing advisory-only policy (2026-04-01 P1-9), bypass attempts
    # are logged and surfaced as advisory guidance rather than hard denials.
    if check_bypass_attempt "$TASK_INPUT"; then
        echo "[ADVISORY] HUBSPOT_BYPASS_ADVISORY: Bypass semantics detected in task input." >&2
        emit_pretool_response \
          "allow" \
          "[ADVISORY] HUBSPOT_BYPASS_ADVISORY: Bypass semantics detected. Routing checks are advisory only — use the required HubSpot agent flow for high-risk operations." \
          "Task input requested bypass semantics. Proceeding with advisory guidance; use the appropriate HubSpot agent for data safety."
        exit 0
    fi

    # Check if high-risk operation
    local _risk_rc=0
    RISK_CATEGORY=$(check_high_risk "$TASK_INPUT") || _risk_rc=$?

    if [ "$_risk_rc" -eq 0 ] && [ -n "$RISK_CATEGORY" ]; then
        # High-risk operation - SUGGESTED agent use (advisory only per 2026-04-01 P1-9 remediation)
        display_mandatory_requirement "$RISK_CATEGORY"

        echo "" >&2
        echo -e "${BOLD}${YELLOW}[ADVISORY] This operation SHOULD use the required agent for safety.${NC}" >&2
        echo "" >&2
        echo -e "${GREEN}SUGGESTED: use:${NC}" >&2
        echo -e "${CYAN}  Agent tool with subagent_type='${REQUIRED_AGENTS[$RISK_CATEGORY]%% with*}'${NC}" >&2
        echo "" >&2
        echo -e "${YELLOW}Or check the agent matrix: /agent-matrix${NC}" >&2
        echo -e "${YELLOW}Proceeding with advisory warning — routing is suggestion-only.${NC}" >&2

        emit_pretool_response \
          "allow" \
          "[ADVISORY] HUBSPOT_AGENT_SUGGESTED: High-risk HubSpot operation should use agent '${REQUIRED_AGENTS[$RISK_CATEGORY]%% with*}'." \
          "Risk category: ${RISK_CATEGORY}. STRONGLY RECOMMENDED: route through the required HubSpot specialist. Proceeding autonomously per advisory-only routing policy."
        exit 0
    fi
    # Non-high-risk operations pass through.
    # Medium-risk agent suggestions are in CLAUDE.md.
}

# Run main function
main

# Exit successfully to continue execution (for non-blocked operations)
emit_pretool_noop
exit 0
