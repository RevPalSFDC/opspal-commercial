#!/bin/bash

# Pre-Task Mandatory Hook - Enforces agent usage for critical operations
# This version REQUIRES agents for high-risk operations (no bypass)
#
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-mandatory"
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
TASK_INPUT="$(echo "$HOOK_INPUT" | jq -r '.prompt // .description // .task // ""' 2>/dev/null || echo "")"
OPERATION_TYPE="$(echo "$HOOK_INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")"

# Log file for tracking
LOG_FILE="${TMPDIR:-/tmp}/agent-hook-mandatory.log"
BYPASS_FILE="${TMPDIR:-/tmp}/agent-bypass-reasons.log"

# Function to log events
log_event() {
    local event="$1"
    local details="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $event: $details" >> "$LOG_FILE"
}

# Define HIGH-RISK operations that REQUIRE agents
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
    ["permission_changes"]="sfdc-security-admin"
    ["data_migration"]="sfdc-data-operations"
    ["metadata_destruction"]="sfdc-metadata-manager with sfdc-planner"
    ["security_changes"]="sfdc-security-admin"
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

# Function to display mandatory agent requirement
display_mandatory_requirement() {
    local category="$1"
    local required_agent="${REQUIRED_AGENTS[$category]}"

    clear
    echo ""
    echo -e "${RED}${BLINK}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}${BOLD}║              🛑 AGENT REQUIRED - STOP! 🛑              ║${NC}"
    echo -e "${RED}${BLINK}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${YELLOW}${BOLD}HIGH-RISK OPERATION DETECTED${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Show risk category
    case "$category" in
        "production_deploy")
            echo -e "${RED}⚠️  PRODUCTION DEPLOYMENT${NC}"
            echo "   Risk: Can impact all users immediately"
            echo "   Potential Issues: Downtime, data loss, broken functionality"
            ;;
        "delete_operations")
            echo -e "${RED}⚠️  DESTRUCTIVE OPERATION${NC}"
            echo "   Risk: Permanent data/metadata loss"
            echo "   Potential Issues: Broken dependencies, data corruption"
            ;;
        "bulk_operations")
            echo -e "${RED}⚠️  BULK DATA OPERATION${NC}"
            echo "   Risk: Governor limit violations"
            echo "   Potential Issues: Operation failure, partial updates"
            ;;
        "permission_changes")
            echo -e "${RED}⚠️  SECURITY MODIFICATION${NC}"
            echo "   Risk: Access control breach"
            echo "   Potential Issues: Unauthorized access, compliance violations"
            ;;
        *)
            echo -e "${RED}⚠️  CRITICAL OPERATION${NC}"
            echo "   Risk: System-wide impact"
            ;;
    esac

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}${BOLD}REQUIRED AGENT(S):${NC} ${PURPLE}$required_agent${NC}"
    echo ""

    echo -e "${YELLOW}This operation CANNOT proceed without the proper agent.${NC}"
    echo -e "${YELLOW}The agent will:${NC}"
    echo "  ✓ Validate prerequisites"
    echo "  ✓ Create rollback plan"
    echo "  ✓ Handle errors gracefully"
    echo "  ✓ Ensure compliance"
    echo "  ✓ Document changes"

    echo ""
    log_event "HIGH_RISK_BLOCKED" "$category: $TASK_INPUT"
}

# Function to check agent bypass attempts
check_bypass_attempt() {
    local task="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Check if user is trying to bypass
    if echo "$task" | grep -iE "\\bforce\\b|\\bbypass\\b|skip.*check|ignore.*warning" | grep -viE "salesforce" > /dev/null; then
        echo ""
        echo -e "${RED}${BOLD}⚠️  BYPASS ATTEMPT DETECTED ⚠️${NC}"
        echo -e "${RED}Attempting to bypass safety checks is not allowed.${NC}"
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
        echo ""
        echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║         💡 AGENT RECOMMENDATION (Medium Risk) 💡        ║${NC}"
        echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}"
        echo ""

        echo -e "${BLUE}Suggested agents for this task:${NC}"
        for agent in "${suggested_agents[@]}"; do
            echo -e "  ${GREEN}▸${NC} ${PURPLE}$agent${NC}"
        done

        echo ""
        echo -e "${YELLOW}While not mandatory, using an agent will:${NC}"
        echo "  • Reduce errors by 80%"
        echo "  • Save 60-90% time"
        echo "  • Ensure best practices"

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
    if [ -f "${PROJECT_ROOT:-/path/to/project}/platforms/SFDC/.claude/agent-analytics.js" ]; then
        if [ "$decision" = "SKIPPED" ]; then
            node "${PROJECT_ROOT:-/path/to/project}/platforms/SFDC/.claude/agent-analytics.js" missed "$task" "suggested" "$reason" 2>/dev/null
        fi
    fi
}

# Main execution
main() {
    # Sub-agents bypass mandatory checks — routing already ensured specialist was spawned
    HOOK_AGENT_TYPE_CHECK="$(echo "${HOOK_INPUT:-}" | jq -r '.agent_type // empty' 2>/dev/null || echo "")"
    if [ -n "${CLAUDE_TASK_ID:-}" ] || [ -n "$HOOK_AGENT_TYPE_CHECK" ]; then
        exit 0
    fi

    # Check for bypass attempts first
    if check_bypass_attempt "$TASK_INPUT"; then
        exit 1
    fi

    # Check if high-risk operation
    RISK_CATEGORY=$(check_high_risk "$TASK_INPUT")

    if [ $? -eq 0 ]; then
        # High-risk operation - MANDATORY agent use
        display_mandatory_requirement "$RISK_CATEGORY"

        echo ""
        agent="${REQUIRED_AGENTS[$RISK_CATEGORY]%% or*}"
        echo "BLOCKED: This operation requires a specialist agent."
        echo "Use: Agent(subagent_type='$agent', prompt=<your request>)"
        echo "The agent provides validation, rollback planning, and compliance checks."
        exit 1
    else
        # Not high-risk, but check for suggestions
        suggest_for_medium_risk "$TASK_INPUT"

        # For medium-risk, log and allow proceeding (hooks cannot read interactive input)
        if [ -n "$TASK_INPUT" ]; then
            track_decision "$TASK_INPUT" "MEDIUM_RISK_ALLOWED" "auto-proceed"
        fi
    fi
}

# Run main function
main

# Exit successfully to continue execution (for non-blocked operations)
exit 0
