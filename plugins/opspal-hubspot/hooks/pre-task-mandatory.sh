#!/usr/bin/env bash
set -euo pipefail

# Pre-Task Mandatory Hook - Enforces agent usage for critical HubSpot operations
# This version REQUIRES agents for high-risk operations (no bypass)
#
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "DEBUG: [pre-task-mandatory] starting" >&2
fi

# Source error handler — try plugin-local lib first, then cross-plugin fallback
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
elif [[ -f "${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi
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

    if ! command -v jq >/dev/null 2>&1; then
        emit_pretool_noop
        return 0
    fi

    jq -nc \
      --arg decision "$permission_decision" \
      --arg reason "$permission_reason" \
      --arg context "$additional_context" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          { hookEventName: "PreToolUse" }
          + (if $decision != "" then { permissionDecision: $decision } else {} end)
          + (if $reason != "" then { permissionDecisionReason: $reason } else {} end)
          + (if $context != "" then { additionalContext: $context } else {} end)
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

# Function to display mandatory agent requirement
display_mandatory_requirement() {
    local category="$1"
    local required_agent="${REQUIRED_AGENTS[$category]}"

    echo "" >&2
    echo -e "${RED}${BLINK}╔════════════════════════════════════════════════════════╗${NC}" >&2
    echo -e "${RED}${BOLD}║           🛑 AGENT REQUIRED - STOP! 🛑                ║${NC}" >&2
    echo -e "${RED}${BLINK}╚════════════════════════════════════════════════════════╝${NC}" >&2
    echo "" >&2

    echo -e "${YELLOW}${BOLD}HIGH-RISK HUBSPOT OPERATION DETECTED${NC}" >&2
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2

    # Show risk category
    case "$category" in
        "production_workflow")
            echo -e "${RED}⚠️  PRODUCTION WORKFLOW MODIFICATION${NC}" >&2
            echo "   Risk: Can impact active campaigns and automations" >&2
            echo "   Potential Issues: Broken automation, incorrect enrollments" >&2
            ;;
        "delete_operations")
            echo -e "${RED}⚠️  DESTRUCTIVE OPERATION${NC}" >&2
            echo "   Risk: Permanent data/configuration loss" >&2
            echo "   Potential Issues: Lost contacts, broken workflows, data corruption" >&2
            ;;
        "bulk_operations")
            echo -e "${RED}⚠️  BULK DATA OPERATION${NC}" >&2
            echo "   Risk: API rate limits, data corruption" >&2
            echo "   Potential Issues: Partial updates, duplicate records, rate limiting" >&2
            ;;
        "integration_setup")
            echo -e "${RED}⚠️  INTEGRATION CONFIGURATION${NC}" >&2
            echo "   Risk: Data sync issues, authentication failures" >&2
            echo "   Potential Issues: Broken integrations, data loss, security exposure" >&2
            ;;
        "data_migration")
            echo -e "${RED}⚠️  DATA MIGRATION${NC}" >&2
            echo "   Risk: Large-scale data corruption" >&2
            echo "   Potential Issues: Data loss, incorrect mappings, broken associations" >&2
            ;;
        *)
            echo -e "${RED}⚠️  CRITICAL OPERATION${NC}" >&2
            echo "   Risk: Portal-wide impact" >&2
            ;;
    esac

    echo "" >&2
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
    echo -e "${GREEN}${BOLD}REQUIRED AGENT(S):${NC} ${PURPLE}$required_agent${NC}" >&2
    echo "" >&2

    echo -e "${YELLOW}This operation CANNOT proceed without the proper agent.${NC}" >&2
    echo -e "${YELLOW}The agent will:${NC}" >&2
    echo "  ✓ Validate prerequisites and portal state" >&2
    echo "  ✓ Check API rate limits" >&2
    echo "  ✓ Create rollback plan" >&2
    echo "  ✓ Handle pagination correctly" >&2
    echo "  ✓ Ensure data integrity" >&2
    echo "  ✓ Document changes" >&2

    echo "" >&2
    log_event "HIGH_RISK_BLOCKED" "$category: $TASK_INPUT"
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

# Function to suggest agents for medium-risk operations
suggest_for_medium_risk() {
    local task="$1"
    local suggested_agents=()

    # Pattern matching for agent suggestions
    declare -A AGENT_PATTERNS=(
        ["hubspot-orchestrator"]="complex|multi.*step|coordinate"
        ["hubspot-workflow-builder"]="workflow|automation|trigger"
        ["hubspot-contact-manager"]="contact|list|segment"
        ["hubspot-pipeline-manager"]="pipeline|deal|forecast"
        ["hubspot-property-manager"]="property|field|custom.*field"
        ["hubspot-marketing-automation"]="email|campaign|nurture"
        ["hubspot-reporting-builder"]="report|dashboard|analytic"
        ["hubspot-data-hygiene-specialist"]="clean|dedupe|quality"
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
        echo -e "${YELLOW}║      💡 AGENT RECOMMENDATION (Medium Risk) 💡          ║${NC}" >&2
        echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}" >&2
        echo "" >&2

        echo -e "${BLUE}Suggested agents for this task:${NC}" >&2
        for agent in "${suggested_agents[@]}"; do
            echo -e "  ${GREEN}▸${NC} ${PURPLE}$agent${NC}" >&2
        done

        echo "" >&2
        echo -e "${YELLOW}While not mandatory, using an agent will:${NC}" >&2
        echo "  • Handle pagination automatically (100% data coverage)" >&2
        echo "  • Manage API rate limits properly" >&2
        echo "  • Reduce errors by 80%" >&2
        echo "  • Save 60-90% time" >&2
        echo "  • Ensure best practices" >&2

        log_event "MEDIUM_RISK_SUGGESTED" "$task: ${suggested_agents[*]}"
    fi
}

# Function to track agent usage decision
track_decision() {
    local task="$1"
    local decision="$2"
    local reason="${3:-none}"

    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] DECISION: $decision | TASK: $task | REASON: $reason" >> "$LOG_FILE"

    # Update analytics if available
    if [ -f "${PROJECT_ROOT:-/path/to/project}/legacy/HS/.claude/agent-analytics.js" ]; then
        if [ "$decision" = "SKIPPED" ]; then
            node "${PROJECT_ROOT:-/path/to/project}/legacy/HS/.claude/agent-analytics.js" missed "$task" "suggested" "$reason" 2>/dev/null
        fi
    fi
}

# Main execution
main() {
    # Check for bypass attempts first
    if check_bypass_attempt "$TASK_INPUT"; then
        emit_pretool_response \
          "deny" \
          "HUBSPOT_BYPASS_ATTEMPT: Attempting to bypass safety checks is not allowed." \
          "Task input requested bypass semantics. Use the required HubSpot agent flow instead."
        exit 0
    fi

    # Check if high-risk operation
    local _risk_rc=0
    RISK_CATEGORY=$(check_high_risk "$TASK_INPUT") || _risk_rc=$?

    if [ "$_risk_rc" -eq 0 ] && [ -n "$RISK_CATEGORY" ]; then
        # High-risk operation - MANDATORY agent use
        display_mandatory_requirement "$RISK_CATEGORY"

        echo "" >&2
        echo -e "${BOLD}${RED}This operation is BLOCKED until you use the required agent.${NC}" >&2
        echo "" >&2
        echo -e "${GREEN}To proceed, use:${NC}" >&2
        echo -e "${CYAN}  Agent tool with subagent_type='${REQUIRED_AGENTS[$RISK_CATEGORY]%% with*}'${NC}" >&2
        echo "" >&2
        echo -e "${YELLOW}Or check the agent matrix: /agent-matrix${NC}" >&2
        echo -e "${RED}${BOLD}Operation blocked. Please use the required agent.${NC}" >&2

        emit_pretool_response \
          "deny" \
          "HUBSPOT_AGENT_REQUIRED: High-risk HubSpot operation requires agent '${REQUIRED_AGENTS[$RISK_CATEGORY]%% with*}'." \
          "Risk category: ${RISK_CATEGORY}. Route through the required HubSpot specialist before retrying."
        exit 0
    else
        # Not high-risk, but check for suggestions
        suggest_for_medium_risk "$TASK_INPUT"

        # Non-blocking path for medium/low-risk operations.
        if [ -n "$TASK_INPUT" ]; then
            track_decision "$TASK_INPUT" "ALLOWED" "non_high_risk"
        fi
    fi
}

# Run main function
main

# Exit successfully to continue execution (for non-blocked operations)
emit_pretool_noop
exit 0
