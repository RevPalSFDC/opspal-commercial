#!/usr/bin/env bash
set -euo pipefail

# Agent Usage Validator Hook for Claude Code
# This hook ensures that Claude Code uses appropriate sub-agents for Salesforce tasks
#
# Version: 1.1.0 (Error Handler Integration)
# Updated: 2025-11-24

# Source standardized error handler (provides logging, exit codes, circuit breaker)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="agent-usage-validator"
else
    # Fallback if error handler not available
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
    log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
    log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }
fi

log_info "Checking for Salesforce task patterns..."

# Check if the user's request contains Salesforce-related keywords
check_salesforce_keywords() {
    local input="$1"
    local keywords=(
        "salesforce" "apex" "soql" "sosl" "trigger" "flow" "workflow"
        "approval process" "custom object" "custom field" "validation rule"
        "permission set" "profile" "user" "role" "sharing rule"
        "report" "dashboard" "changeset" "deploy" "sandbox"
        "data import" "data export" "integration" "api" "webhook"
        "lightning" "lwc" "aura" "visualforce" "page layout"
        "record type" "picklist" "formula field" "rollup summary"
        "opportunity" "account" "contact" "lead" "case"
        "campaign" "quote" "order" "product" "price book"
    )
    
    for keyword in "${keywords[@]}"; do
        if echo "$input" | grep -qi "$keyword"; then
            return 0
        fi
    done
    return 1
}

# Suggest appropriate agent based on task
suggest_agent() {
    local input="$1"
    
    # Check for specific patterns and suggest agents
    if echo "$input" | grep -qi "report\|dashboard\|analytics"; then
        echo "sfdc-reports-dashboards"
    elif echo "$input" | grep -qi "field\|object\|validation\|page layout\|record type"; then
        echo "sfdc-metadata-manager"
    elif echo "$input" | grep -qi "user\|permission\|profile\|role\|sharing"; then
        echo "sfdc-permission-orchestrator"
    elif echo "$input" | grep -qi "flow\|workflow\|approval\|process builder"; then
        echo "sfdc-automation-builder"
    elif echo "$input" | grep -qi "import\|export\|data load\|bulk"; then
        echo "sfdc-data-operations"
    elif echo "$input" | grep -qi "deploy\|changeset\|sandbox\|migration"; then
        echo "sfdc-deployment-manager"
    elif echo "$input" | grep -qi "apex\|trigger\|class\|test"; then
        echo "sfdc-apex-developer"
    elif echo "$input" | grep -qi "integration\|api\|webhook\|callout"; then
        echo "sfdc-integration-specialist"
    elif echo "$input" | grep -qi "backup\|restore"; then
        echo "instance-backup"
    elif echo "$input" | grep -qi "sync.*instance\|instance.*sync"; then
        echo "instance-sync"
    elif echo "$input" | grep -qi "assess\|audit\|review\|revops"; then
        echo "sfdc-revops-auditor"
    elif echo "$input" | grep -qi "plan\|design\|architect"; then
        echo "sfdc-planner"
    elif echo "$input" | grep -qi "service cloud\|case\|knowledge\|omni"; then
        echo "sfdc-service-cloud-admin"
    elif echo "$input" | grep -qi "lightning\|lwc\|aura\|component"; then
        echo "sfdc-lightning-developer"
    elif echo "$input" | grep -qi "compliance\|gdpr\|hipaa\|sox\|audit"; then
        echo "sfdc-compliance-officer"
    elif echo "$input" | grep -qi "cpq\|quote\|pricing\|discount"; then
        echo "sfdc-cpq-specialist"
    elif echo "$input" | grep -qi "einstein\|ai\|prediction\|machine learning"; then
        echo "sfdc-einstein-admin"
    elif echo "$input" | grep -qi "performance\|optimize\|governor\|limit"; then
        echo "sfdc-performance-optimizer"
    else
        echo "sfdc-orchestrator"  # Default to orchestrator for complex/unclear tasks
    fi
}

# Main validation logic
if [ -n "$CLAUDE_USER_MESSAGE" ]; then
    if check_salesforce_keywords "$CLAUDE_USER_MESSAGE"; then
        suggested_agent=$(suggest_agent "$CLAUDE_USER_MESSAGE")

        log_success "Salesforce task detected!"
        echo -e "${YELLOW}📌 Suggested agent: ${GREEN}${suggested_agent}${NC}" >&2
        echo -e "${YELLOW}💡 Remember to use the Agent tool to launch the appropriate sub-agent.${NC}" >&2

        # Set environment variable for Claude to use
        export SUGGESTED_SFDC_AGENT="$suggested_agent"

        # Add a reminder to the context
        echo -e "\n${YELLOW}REMINDER: Use the '${suggested_agent}' agent via the Agent tool for this Salesforce operation.${NC}" >&2
    fi
fi

# Exit successfully (this hook is advisory, not blocking)
exit 0
