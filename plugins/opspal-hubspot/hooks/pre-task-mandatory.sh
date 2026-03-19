#!/bin/bash

# Pre-Task Mandatory Hook - Enforces agent usage for critical HubSpot operations
# This version REQUIRES agents for high-risk operations (no bypass)
#
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-mandatory-hubspot"
    # Keep strict mode for security-critical hook
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
BLINK='\033[5m'
NC='\033[0m' # No Color

# Get the user's input/task
TASK_INPUT="$1"
OPERATION_TYPE="${2:-unknown}"
BLOCK_EXIT_CODE="${HOOK_BLOCK_EXIT_CODE:-2}"

HOOK_INPUT=""
if [[ ! -t 0 ]]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

if [[ -z "$TASK_INPUT" ]] && [[ -n "$HOOK_INPUT" ]] && command -v jq >/dev/null 2>&1; then
    TASK_INPUT=$(echo "$HOOK_INPUT" | jq -r '.tool_input.prompt // .prompt // .description // .task // ""' 2>/dev/null || echo "")
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

    clear
    echo ""
    echo -e "${RED}${BLINK}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}${BOLD}║           🛑 AGENT REQUIRED - STOP! 🛑                ║${NC}"
    echo -e "${RED}${BLINK}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${YELLOW}${BOLD}HIGH-RISK HUBSPOT OPERATION DETECTED${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Show risk category
    case "$category" in
        "production_workflow")
            echo -e "${RED}⚠️  PRODUCTION WORKFLOW MODIFICATION${NC}"
            echo "   Risk: Can impact active campaigns and automations"
            echo "   Potential Issues: Broken automation, incorrect enrollments"
            ;;
        "delete_operations")
            echo -e "${RED}⚠️  DESTRUCTIVE OPERATION${NC}"
            echo "   Risk: Permanent data/configuration loss"
            echo "   Potential Issues: Lost contacts, broken workflows, data corruption"
            ;;
        "bulk_operations")
            echo -e "${RED}⚠️  BULK DATA OPERATION${NC}"
            echo "   Risk: API rate limits, data corruption"
            echo "   Potential Issues: Partial updates, duplicate records, rate limiting"
            ;;
        "integration_setup")
            echo -e "${RED}⚠️  INTEGRATION CONFIGURATION${NC}"
            echo "   Risk: Data sync issues, authentication failures"
            echo "   Potential Issues: Broken integrations, data loss, security exposure"
            ;;
        "data_migration")
            echo -e "${RED}⚠️  DATA MIGRATION${NC}"
            echo "   Risk: Large-scale data corruption"
            echo "   Potential Issues: Data loss, incorrect mappings, broken associations"
            ;;
        *)
            echo -e "${RED}⚠️  CRITICAL OPERATION${NC}"
            echo "   Risk: Portal-wide impact"
            ;;
    esac

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}${BOLD}REQUIRED AGENT(S):${NC} ${PURPLE}$required_agent${NC}"
    echo ""

    echo -e "${YELLOW}This operation CANNOT proceed without the proper agent.${NC}"
    echo -e "${YELLOW}The agent will:${NC}"
    echo "  ✓ Validate prerequisites and portal state"
    echo "  ✓ Check API rate limits"
    echo "  ✓ Create rollback plan"
    echo "  ✓ Handle pagination correctly"
    echo "  ✓ Ensure data integrity"
    echo "  ✓ Document changes"

    echo ""
    log_event "HIGH_RISK_BLOCKED" "$category: $TASK_INPUT"
}

# Function to check agent bypass attempts
check_bypass_attempt() {
    local task="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Check if user is trying to bypass
    if echo "$task" | grep -iE "force|bypass|skip.*check|ignore.*warning" > /dev/null; then
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
        echo ""
        echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║      💡 AGENT RECOMMENDATION (Medium Risk) 💡          ║${NC}"
        echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}"
        echo ""

        echo -e "${BLUE}Suggested agents for this task:${NC}"
        for agent in "${suggested_agents[@]}"; do
            echo -e "  ${GREEN}▸${NC} ${PURPLE}$agent${NC}"
        done

        echo ""
        echo -e "${YELLOW}While not mandatory, using an agent will:${NC}"
        echo "  • Handle pagination automatically (100% data coverage)"
        echo "  • Manage API rate limits properly"
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
        exit "$BLOCK_EXIT_CODE"
    fi

    # Check if high-risk operation
    RISK_CATEGORY=$(check_high_risk "$TASK_INPUT")

    if [ $? -eq 0 ]; then
        # High-risk operation - MANDATORY agent use
        display_mandatory_requirement "$RISK_CATEGORY"

        echo ""
        echo -e "${BOLD}${RED}This operation is BLOCKED until you use the required agent.${NC}"
        echo ""
        echo -e "${GREEN}To proceed, use:${NC}"
        echo -e "${CYAN}  Agent tool with subagent_type='${REQUIRED_AGENTS[$RISK_CATEGORY]%% with*}'${NC}"
        echo ""
        echo -e "${YELLOW}Or check the agent matrix: /agent-matrix${NC}"
        echo -e "${RED}${BOLD}Operation blocked. Please use the required agent.${NC}"

        # Exit with error to prevent operation
        exit "$BLOCK_EXIT_CODE"
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
exit 0
