#!/usr/bin/env bash

# Pre-Task Agent Discovery & Organization Enforcement Hook
# ENHANCED: Now BLOCKS high-risk operations without agents
# Automatically suggests relevant agents and enforces project organization
#
# Version: 1.1.0 (Error Handler Integration)
# Date: 2025-11-24

set -euo pipefail

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-hook"
    # Keep strict mode - this hook can block operations
fi

# Color codes — error handler sets RED/YELLOW/GREEN/BLUE/NC as readonly,
# so only set missing ones. Use :- to avoid readonly conflicts under set -u.
RED="${RED:-\033[0;31m}"
YELLOW="${YELLOW:-\033[1;33m}"
GREEN="${GREEN:-\033[0;32m}"
BLUE="${BLUE:-\033[0;34m}"
NC="${NC:-\033[0m}"
CYAN="${CYAN:-\033[0;36m}"
PURPLE="${PURPLE:-\033[0;35m}"
BOLD="${BOLD:-\033[1m}"

# Exit codes (only set if error handler was NOT loaded)
if [[ -z "${HOOK_NAME:-}" ]]; then
    EXIT_AGENT_REQUIRED=10
    EXIT_SUCCESS=0
else
    EXIT_AGENT_REQUIRED=${EXIT_AGENT_REQUIRED:-10}
fi

# Organization enforcement configuration
BASE_DIR="${CLAUDE_PLUGIN_ROOT:-}"
ORG_ENFORCER="$BASE_DIR/scripts/lib/organization-enforcer.js"
PROJECT_INIT="$BASE_DIR/scripts/init-project.sh"

# Redirect all output to stderr — this hook emits informational banners, not JSON
exec 1>&2

# Get the user's input/task
TASK_INPUT="${1:-}"

# ═══════════════════════════════════════════════════════════════
# PROMINENT AGENT DECISION REMINDER
# ═══════════════════════════════════════════════════════════════
echo
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${BOLD}              🎯 AGENT-FIRST DECISION CHECKPOINT 🎯             ${NC}${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${BOLD}Quick Check (4 questions):${NC}"
echo -e "  ${CYAN}1.${NC} Complex/multi-step?        → principal-engineer or sfdc-orchestrator"
echo -e "  ${CYAN}2.${NC} High-risk/production?      → See mandatory agents below"
echo -e "  ${CYAN}3.${NC} Keyword match?             → See pattern matching below"
echo -e "  ${CYAN}4.${NC} When in doubt?             → USE AN AGENT!"
echo
echo -e "${YELLOW}📋 See full decision card: .claude/AGENT_DECISION_CARD.md${NC}"
echo

# Define agent patterns and their triggers
declare -A AGENT_PATTERNS=(
    ["release|deploy|tag|production|merge.*main"]="release-coordinator"
    ["conflict|failed|mismatch|incompatible"]="sfdc-conflict-resolver"
    ["merge.*field|consolidate.*object|combine"]="sfdc-merge-orchestrator"
    ["complex|planning|strategy|roadmap"]="sfdc-planner"
    ["metadata|field|object|validation.*rule"]="sfdc-metadata-manager"
    ["permission|profile|security|access|field.*level.*security|FLS"]="sfdc-security-admin"
    ["record.*type.*default|default.*record.*type|profile.*record.*type"]="sfdc-security-admin"
    ["data.*import|bulk|export|migration"]="sfdc-data-operations"
    ["apex|trigger|class|test.*coverage"]="sfdc-apex-developer"
    ["flow|automation|workflow|process.*builder"]="sfdc-automation-builder"
    ["report|dashboard|analytics"]="sfdc-reports-dashboards"
    ["revops|audit|assessment|benchmark"]="sfdc-revops-auditor"
    ["dependency|sequence|order|circular"]="sfdc-dependency-analyzer"
    ["lightning|lwc|aura|component"]="sfdc-lightning-developer"
    ["integration|api|webhook|callout"]="sfdc-integration-specialist"
    # NEW: Bulk data operation patterns (from session reflection 2025-10-06)
    ["update.*based on|set.*to.*for|calculate.*from"]="sfdc-data-operations"
    ["sync.*with|copy.*to.*field"]="sfdc-data-operations"
    ["update.*[0-9]{2,}.*record|update.*renewal|update.*opportunit"]="sfdc-data-operations"
    ["populate.*field|fill.*field|set.*field.*value"]="sfdc-data-operations"
)

# Check if task matches any patterns
SUGGESTED_AGENTS=()
for pattern in "${!AGENT_PATTERNS[@]}"; do
    if echo "$TASK_INPUT" | grep -iE "$pattern" > /dev/null; then
        SUGGESTED_AGENTS+=("${AGENT_PATTERNS[$pattern]}")
    fi
done

# Display suggestions if any matches found
if [ ${#SUGGESTED_AGENTS[@]} -gt 0 ]; then
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║         🤖 AGENT SUGGESTION SYSTEM ACTIVATED 🤖        ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "${BLUE}Based on your task, consider using these specialized agents:${NC}"
    echo

    for agent in "${SUGGESTED_AGENTS[@]}"; do
        echo -e "  ${GREEN}▸${NC} ${PURPLE}$agent${NC}"

        # Add brief description for each agent
        case $agent in
            "release-coordinator")
                echo -e "    ${NC}Orchestrates end-to-end release process${NC}"
                ;;
            "sfdc-conflict-resolver")
                echo -e "    ${NC}Prevents deployment failures by resolving conflicts${NC}"
                ;;
            "sfdc-planner")
                echo -e "    ${NC}Analyzes requirements and creates implementation plans${NC}"
                ;;
            "sfdc-metadata-manager")
                echo -e "    ${NC}Manages objects, fields, and validation rules${NC}"
                ;;
            "sfdc-revops-auditor")
                echo -e "    ${NC}Performs comprehensive RevOps assessments with benchmarks${NC}"
                ;;
            "sfdc-data-operations")
                echo -e "    ${NC}Handles bulk updates, field calculations, and data operations${NC}"
                echo -e "    ${YELLOW}⚡ Includes pre-validation to check if operation already complete${NC}"
                ;;
            "sfdc-security-admin")
                echo -e "    ${NC}Manages permissions, profiles, FLS, and security settings${NC}"
                echo -e "    ${YELLOW}⚠️  Profile operations: Agent will recommend UI-based workflow${NC}"
                ;;
        esac
    done

    echo
    echo -e "${YELLOW}To use an agent, invoke with:${NC} Agent tool with subagent_type"
    echo -e "${YELLOW}Example:${NC} Use Agent tool with subagent_type='sfdc-planner'"
    echo
fi

# ═══════════════════════════════════════════════════════════════
# MANDATORY AGENT ENFORCEMENT (BLOCKING)
# ═══════════════════════════════════════════════════════════════

# Define MANDATORY agent operations (these will BLOCK execution)
declare -A MANDATORY_OPERATIONS=(
    ["(deploy|push|release).*production|production.*(deploy|push|release)"]="release-coordinator"
    ["delete.*(field|object|class)"]="sfdc-metadata-manager"
    ["permission.*set.*(create|update)|create.*permission.*set|update.*permission.*set"]="sfdc-security-admin"
    ["bulk.*(update|insert|delete)|(update|insert|delete).*[0-9]{3,}.*record"]="sfdc-data-operations"
    ["(create|update|modify).*(flow|workflow)"]="sfdc-automation-builder"
    ["revops.*audit|cpq.*assess"]="sfdc-revops-auditor or sfdc-cpq-assessor"
    # NEW: Direct metadata operations (from session reflection)
    ["(create|update|modify|change).*(profile|permission)"]="sfdc-security-admin"
    ["(create|update|modify).*(tab|custom tab)"]="sfdc-ui-customizer or sfdc-orchestrator"
    ["(configure|update|modify).*(app|application|custom application)"]="sfdc-ui-customizer or sfdc-orchestrator"
    ["tab.*visibility|visibility.*tab|(default on|default off|hidden).*tab"]="sfdc-security-admin"
    ["profile.*(update|modify|change)|update.*profile.*setting"]="sfdc-security-admin"
    ["(set|change|update).*(default.*record.*type|record.*type.*default)"]="sfdc-security-admin"
    ["profile.*permission|FLS|field.*level.*security"]="sfdc-security-admin"
    ["(modify|update|change).*profile.*for.*(all|multiple|many)"]="sfdc-security-admin"
    # NEW: Bulk field calculation operations (from session reflection 2025-10-06)
    ["update.*[0-9]{2,}.*(renewal|opportunit|account|contact)"]="sfdc-data-operations"
    ["update.*field.*based on|calculate.*field|sync.*field.*with"]="sfdc-data-operations"
    ["set.*(field|value).*for.*[0-9]{2,}"]="sfdc-data-operations"
)

AGENT_REQUIRED=false
REQUIRED_AGENT=""

# Sub-agents bypass mandatory routing — the routing system already ensured
# the correct specialist was spawned. Blocking here creates a deadlock.
HOOK_AGENT_TYPE_CHECK="$(echo "${HOOK_INPUT:-$TASK_INPUT}" | jq -r '.agent_type // empty' 2>/dev/null || echo "")"
if [ -n "${CLAUDE_TASK_ID:-}" ] || [ -n "$HOOK_AGENT_TYPE_CHECK" ]; then
    echo "[pre-task-hook] Agent context detected (task=${CLAUDE_TASK_ID:-none}, agent=${HOOK_AGENT_TYPE_CHECK:-unknown}). Skipping mandatory routing." >&2
    AGENT_REQUIRED=false
else

for pattern in "${!MANDATORY_OPERATIONS[@]}"; do
    if echo "$TASK_INPUT" | grep -iE "$pattern" > /dev/null; then
        AGENT_REQUIRED=true
        REQUIRED_AGENT="${MANDATORY_OPERATIONS[$pattern]}"

        echo
        echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║${BOLD}                ⛔ EXECUTION BLOCKED ⛔                         ${NC}${RED}║${NC}"
        echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
        echo
        echo -e "${RED}${BOLD}HIGH-RISK OPERATION DETECTED:${NC}"
        echo -e "  Request matches pattern: ${YELLOW}${pattern}${NC}"
        echo
        echo -e "${RED}${BOLD}MANDATORY AGENT REQUIRED:${NC}"
        echo -e "  ${GREEN}→ ${REQUIRED_AGENT}${NC}"
        echo
        echo -e "${YELLOW}This operation CANNOT proceed without using the specified agent.${NC}"
        echo -e "${YELLOW}This enforcement prevents:${NC}"
        echo -e "  • Deployment failures"
        echo -e "  • Data loss"
        echo -e "  • Security vulnerabilities"
        echo -e "  • Production incidents"
        echo
        echo -e "${CYAN}${BOLD}To proceed:${NC}"
        echo -e "  1. Use the Agent tool with subagent_type='${REQUIRED_AGENT}'"
        echo -e "  2. Let the agent handle validation and execution"
        echo -e "  3. Review agent output before confirming"
        echo
        echo -e "${RED}Exiting to prevent unsafe operation...${NC}"
        echo

        exit $EXIT_AGENT_REQUIRED
    fi
done
fi  # end agent-context bypass


# Organization Enforcement Check
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Organization Check${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

# Keywords that indicate multi-file operations
MULTI_FILE_KEYWORDS=(
    "cleanup"
    "migration"
    "bulk"
    "batch"
    "import"
    "export"
    "reports"
    "dashboard"
    "multiple"
    "analyze.*data"
    "create.*fields"
    "deploy"
)

# Check if this looks like a multi-file operation
IS_MULTI_FILE=false
for keyword in "${MULTI_FILE_KEYWORDS[@]}"; do
    if echo "$TASK_INPUT" | grep -iE "$keyword" > /dev/null; then
        IS_MULTI_FILE=true
        break
    fi
done

# Check if we're in a project directory
IN_PROJECT=false
if [ -f "config/project.json" ]; then
    IN_PROJECT=true
fi

# Enforce project structure for multi-file operations
if [ "$IS_MULTI_FILE" = true ] && [ "$IN_PROJECT" = false ]; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║         ⚠️  PROJECT STRUCTURE REQUIRED ⚠️                    ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "${YELLOW}This operation involves multiple files and requires proper${NC}"
    echo -e "${YELLOW}project organization to prevent scattered files.${NC}"
    echo
    echo -e "${GREEN}Initialize a project first:${NC}"
    echo -e "  ${BLUE}./scripts/init-project.sh \"project-name\" \"org-alias\" --type [type]${NC}"
    echo
    echo -e "${YELLOW}Available project types:${NC}"
    echo -e "  • data-cleanup    - For data cleanup operations"
    echo -e "  • deployment      - For metadata deployments"
    echo -e "  • analysis        - For data analysis projects"
    echo -e "  • report-creation - For report/dashboard creation"
    echo
    echo -e "${YELLOW}After creating the project:${NC}"
    echo -e "  1. cd into the project directory"
    echo -e "  2. Use TodoWrite to plan your tasks"
    echo -e "  3. Follow naming conventions for all files"
    echo
    echo -e "${RED}This enforcement prevents the organizational issues that${NC}"
    echo -e "${RED}occurred during the example-company contact cleanup project.${NC}"
    echo
fi

# Check for existing violations
if command -v node &> /dev/null && [ -f "$ORG_ENFORCER" ]; then
    VIOLATIONS=$(node "$ORG_ENFORCER" check 2>/dev/null | grep "violations found" || true)
    if [[ "$VIOLATIONS" == *"violations found"* ]]; then
        echo
        echo -e "${YELLOW}⚠️  Organization violations detected in current directory${NC}"
        echo -e "Run: ${BLUE}node scripts/lib/organization-enforcer.js check${NC}"
        echo
    fi
fi

# Reminder for project users
if [ "$IN_PROJECT" = true ]; then
    echo -e "${GREEN}✓ Project structure detected${NC}"
    PROJECT_NAME=$(cat config/project.json 2>/dev/null | grep '"projectName"' | cut -d'"' -f4)
    if [ -n "$PROJECT_NAME" ]; then
        echo -e "${GREEN}  Project: ${PROJECT_NAME}${NC}"
    fi
    echo -e "${YELLOW}Remember to:${NC}"
    echo -e "  • Update TodoWrite with task progress"
    echo -e "  • Follow naming: scripts/{number}-{action}-{target}.js"
    echo -e "  • Keep files in designated directories"
    echo
fi

# Exit successfully to continue execution
exit 0
