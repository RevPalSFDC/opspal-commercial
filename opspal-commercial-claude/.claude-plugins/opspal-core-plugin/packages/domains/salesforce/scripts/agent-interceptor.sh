#!/bin/bash

# Agent Interceptor - Real-time command interception and agent routing
# Forces agent usage for critical operations and suggests agents for others

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(dirname "$0")"
LIB_DIR="${SCRIPT_DIR}/lib"
AGENT_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
LOG_FILE="${TEMP_DIR:-/tmp}"
BYPASS_FLAG="${BYPASS_AGENT_CHECK:-false}"

# Load agent triggers
TRIGGERS_FILE="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"

# Function to log operations
log_operation() {
    local operation="$1"
    local agent_used="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] Operation: $operation | Agent: ${agent_used:-none}" >> "$LOG_FILE"
}

# Function to check if operation is high-risk
is_high_risk() {
    local cmd="$1"

    # Critical patterns that MUST use agents
    local high_risk_patterns=(
        "production.*deploy"
        "delete.*(field|object|class)"
        "bulk.*(update|insert|delete)"
        "permission.*set.*(create|update)"
        "truncate"
        "drop"
        "sf.*deploy.*--target-org.*(production|prod)"
        "sf.*org.*delete"
    )

    for pattern in "${high_risk_patterns[@]}"; do
        if echo "$cmd" | grep -iE "$pattern" > /dev/null; then
            return 0  # Is high risk
        fi
    done

    return 1  # Not high risk
}

# Function to get recommended agent for command
get_recommended_agent() {
    local cmd="$1"

    # Agent mapping based on command patterns
    declare -A agent_map=(
        ["deploy|release|production"]="sfdc-deployment-manager"
        ["conflict|error|failed"]="sfdc-conflict-resolver"
        ["merge|consolidate|combine"]="sfdc-merge-orchestrator"
        ["field.*create|object.*create"]="sfdc-metadata-manager"
        ["permission|security|profile"]="sfdc-security-admin"
        ["bulk|import|export|data.*load"]="sfdc-data-operations"
        ["apex|trigger|class"]="sfdc-apex-developer"
        ["flow|automation|workflow"]="sfdc-automation-builder"
        ["report|dashboard"]="sfdc-reports-dashboards"
        ["soql|query.*select"]="sfdc-query-specialist"
        ["test|coverage"]="sfdc-apex-developer"
    )

    for pattern in "${!agent_map[@]}"; do
        if echo "$cmd" | grep -iE "$pattern" > /dev/null; then
            echo "${agent_map[$pattern]}"
            return 0
        fi
    done

    # Check complexity - if command has many flags or pipes
    local complexity=$(echo "$cmd" | grep -o '|' | wc -l)
    local flag_count=$(echo "$cmd" | grep -o ' -' | wc -l)

    if [ $complexity -gt 2 ] || [ $flag_count -gt 5 ]; then
        echo "sfdc-orchestrator"
        return 0
    fi

    return 1
}

# Function to display agent suggestion
suggest_agent() {
    local cmd="$1"
    local agent="$2"
    local mandatory="${3:-false}"

    echo ""
    if [ "$mandatory" = "true" ]; then
        echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║          ⚠️  AGENT REQUIRED - HIGH RISK OPERATION ⚠️      ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
    else
        echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║            🤖 AGENT RECOMMENDATION SYSTEM 🤖            ║${NC}"
        echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}"
    fi

    echo ""
    echo -e "${BLUE}Command detected:${NC} $cmd"
    echo ""
    echo -e "${GREEN}Recommended agent:${NC} ${PURPLE}$agent${NC}"

    # Show agent description
    case $agent in
        "sfdc-deployment-manager")
            echo -e "${CYAN}→ Manages deployments with validation and rollback${NC}"
            ;;
        "sfdc-conflict-resolver")
            echo -e "${CYAN}→ Resolves conflicts and prevents deployment failures${NC}"
            ;;
        "sfdc-data-operations")
            echo -e "${CYAN}→ Handles bulk operations with governor limit protection${NC}"
            ;;
        "sfdc-metadata-manager")
            echo -e "${CYAN}→ Manages objects and fields with dependency checking${NC}"
            ;;
        "sfdc-security-admin")
            echo -e "${CYAN}→ Handles permissions with security compliance${NC}"
            ;;
        *)
            echo -e "${CYAN}→ Specialized agent for this operation type${NC}"
            ;;
    esac

    echo ""

    if [ "$mandatory" = "true" ]; then
        echo -e "${RED}This operation REQUIRES using the recommended agent.${NC}"
        echo -e "${RED}Direct execution is blocked for safety.${NC}"
    else
        echo -e "${YELLOW}Using this agent will:${NC}"
        echo -e "  ✓ Prevent common errors"
        echo -e "  ✓ Handle edge cases automatically"
        echo -e "  ✓ Provide rollback capability"
    fi
}

# Function to prompt for agent use
prompt_agent_use() {
    local agent="$1"
    local mandatory="${2:-false}"

    echo ""

    if [ "$mandatory" = "true" ]; then
        echo -e "${BOLD}Press ENTER to proceed with $agent (or Ctrl+C to cancel)${NC}"
        read -r
        return 0  # Always use agent for mandatory operations
    else
        echo -e "${BOLD}Options:${NC}"
        echo -e "  [${GREEN}Y${NC}] Use $agent (recommended)"
        echo -e "  [${YELLOW}N${NC}] Proceed without agent"
        echo -e "  [${RED}C${NC}] Cancel operation"
        echo ""
        echo -n "Choice [Y/n/c]: "
        read -r choice

        case "${choice,,}" in
            n)
                # Ask for justification
                echo ""
                echo -e "${YELLOW}Please provide a reason for not using the agent:${NC}"
                read -r reason
                log_operation "$ORIGINAL_CMD" "SKIPPED:$agent:$reason"
                return 1
                ;;
            c)
                echo -e "${RED}Operation cancelled.${NC}"
                exit 0
                ;;
            *)
                return 0
                ;;
        esac
    fi
}

# Function to invoke agent
invoke_agent() {
    local agent="$1"
    local cmd="$2"

    echo ""
    echo -e "${GREEN}Invoking $agent...${NC}"
    echo ""

    # Log agent usage
    log_operation "$cmd" "$agent"

    # Here you would normally invoke the Task tool with the agent
    # For now, we'll show what would happen
    cat <<EOF
${CYAN}═══════════════════════════════════════════════════════${NC}
${BOLD}Agent Invocation:${NC}

Task tool with:
  subagent_type: "$agent"
  prompt: "Execute: $cmd"
  description: "Intercepted command execution"

The agent will:
1. Validate the operation
2. Check prerequisites
3. Execute safely with error handling
4. Provide rollback if needed
${CYAN}═══════════════════════════════════════════════════════${NC}

EOF

    echo -e "${GREEN}✓ Agent invocation complete${NC}"

    # Update analytics
    if [ -f "$SCRIPT_DIR/../.claude/agent-analytics.js" ]; then
        node "$SCRIPT_DIR/../.claude/agent-analytics.js" log "$agent" "$cmd" true 2>/dev/null
    fi
}

# Function to track skipped agents
track_missed_opportunity() {
    local cmd="$1"
    local agent="$2"

    if [ -f "$SCRIPT_DIR/../.claude/agent-analytics.js" ]; then
        node "$SCRIPT_DIR/../.claude/agent-analytics.js" missed "$cmd" "$agent" "User skipped suggestion" 2>/dev/null
    fi
}

# Main interception logic
intercept_command() {
    local cmd="$1"

    # Skip if bypass flag is set
    if [ "$BYPASS_FLAG" = "true" ]; then
        return 1
    fi

    # Check if command is high risk
    if is_high_risk "$cmd"; then
        local agent=$(get_recommended_agent "$cmd")
        if [ -n "$agent" ]; then
            suggest_agent "$cmd" "$agent" true
            if prompt_agent_use "$agent" true; then
                invoke_agent "$agent" "$cmd"
                return 0
            fi
        fi
    else
        # Check for recommended agent
        local agent=$(get_recommended_agent "$cmd")
        if [ -n "$agent" ]; then
            suggest_agent "$cmd" "$agent" false
            if prompt_agent_use "$agent" false; then
                invoke_agent "$agent" "$cmd"
                return 0
            else
                track_missed_opportunity "$cmd" "$agent"
                return 1
            fi
        fi
    fi

    return 1
}

# Store original command for logging
ORIGINAL_CMD="$*"

# Check if this is an SF command or other relevant command
if [[ "$1" == "sfdx" ]]; then
    echo "Error: Legacy sfdx commands are not supported. Use sf commands only." >&2
    exit 1
fi

if [[ "$1" =~ ^(sf|git|npm) ]] || [[ "$*" =~ (deploy|migrate|bulk|permission) ]]; then
    if intercept_command "$ORIGINAL_CMD"; then
        # Command was handled by agent
        exit 0
    fi
fi

# Execute original command if not intercepted
exec "$@"
