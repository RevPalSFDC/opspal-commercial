#!/bin/bash

##############################################################################
# Script Aliases for ClaudeSFDC
##############################################################################
# Source this file in your .bashrc or .zshrc:
# source /path/to/ClaudeSFDC/scripts/script-aliases.sh
##############################################################################

# Get the directory where this script is located
CLAUDE_SFDC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="${CLAUDE_SFDC_DIR}/scripts"

# Unified Scripts (New Consolidated Tools)
alias sfdc-import="${SCRIPTS_DIR}/unified-import-manager.sh"
alias sfdc-validate-data="${SCRIPTS_DIR}/unified-data-validator.sh"
alias sfdc-validate-system="${SCRIPTS_DIR}/unified-system-validator.sh"

# Security Tools
alias sfdc-security-audit="${SCRIPTS_DIR}/security-audit-report.sh"
alias sfdc-fix-eval="${SCRIPTS_DIR}/fix-remaining-eval-usage.sh"
alias sfdc-fix-errors="${SCRIPTS_DIR}/fix-missing-error-handling.sh"

# Instance Management
alias sfdc-switch-instance="${SCRIPTS_DIR}/switch-instance.sh"
alias sfdc-persist-config="${SCRIPTS_DIR}/persist-instance-config.sh"
alias sfdc-init="${SCRIPTS_DIR}/init-salesforce-instance.sh"

# Deployment Tools
alias sfdc-deploy-revenue="${SCRIPTS_DIR}/deploy-revenue-fields.sh"
alias sfdc-deploy-rollup="${SCRIPTS_DIR}/deploy-rollup-solution.sh"
alias sfdc-deploy-all="${SCRIPTS_DIR}/deployment/deploy-all-components.sh"

# Monitoring and Health
alias sfdc-monitor="${SCRIPTS_DIR}/claude-monitor.sh"
alias sfdc-performance="${SCRIPTS_DIR}/claude-performance-monitor.sh"
alias sfdc-health="${SCRIPTS_DIR}/mcp-health-monitor.sh"
alias sfdc-dashboard="${SCRIPTS_DIR}/claude-dashboard.sh"

# Testing Tools
alias sfdc-test-renewal="${SCRIPTS_DIR}/test-renewal-automation.sh"
alias sfdc-test-contract="${SCRIPTS_DIR}/test-contract-creation-flow.sh"
alias sfdc-test-verification="${SCRIPTS_DIR}/test-verification-system.sh"
alias sfdc-test-all="${SCRIPTS_DIR}/test-auto-fix.sh all"

# Utility Functions
alias sfdc-inventory="${SCRIPTS_DIR}/generate-script-inventory.py"
alias sfdc-make-exec="${SCRIPTS_DIR}/make-scripts-executable.sh"
alias sfdc-cleanup="${SCRIPTS_DIR}/utilities/cleanup-main-directory.sh"

# Quick Navigation
alias sfdc-cd="cd ${CLAUDE_SFDC_DIR}"
alias sfdc-scripts="cd ${SCRIPTS_DIR}"
alias sfdc-lib="cd ${SCRIPTS_DIR}/lib"

sfdc-instances() {
    local root
    root=$(node "${SCRIPTS_DIR}/ensure-instance-ready.js" --print-root 2>/dev/null || true)
    if [ -n "$root" ] && [ -d "$root" ]; then
        cd "$root"
        return 0
    fi
    echo "Instances root not found. Set SFDC_INSTANCES_ROOT or run from a workspace with instances." >&2
    return 1
}

# Common Operations with Libraries
sfdc-query() {
    source "${SCRIPTS_DIR}/lib/shell-commons.sh"
    local query="$1"
    local org="${2:-$(get_org_alias)}"
    safe_sf_query "$query" "$org"
}

sfdc-deploy() {
    source "${SCRIPTS_DIR}/lib/shell-commons.sh"
    local path="${1:-force-app}"
    local org="${2:-$(get_org_alias)}"
    safe_sf_deploy "$path" "$org"
}

# Help function
sfdc-help() {
    echo "ClaudeSFDC Script Aliases"
    echo "========================="
    echo ""
    echo "Import/Export:"
    echo "  sfdc-import              - Unified import manager"
    echo ""
    echo "Validation:"
    echo "  sfdc-validate-data       - Data validation"
    echo "  sfdc-validate-system     - System validation"
    echo ""
    echo "Security:"
    echo "  sfdc-security-audit      - Run security audit"
    echo "  sfdc-fix-eval           - Fix eval usage"
    echo "  sfdc-fix-errors         - Fix error handling"
    echo ""
    echo "Instance Management:"
    echo "  sfdc-switch-instance    - Switch Salesforce instance"
    echo "  sfdc-persist-config     - Save/load configuration"
    echo ""
    echo "Monitoring:"
    echo "  sfdc-monitor            - System monitor"
    echo "  sfdc-performance        - Performance monitor"
    echo "  sfdc-dashboard          - Interactive dashboard"
    echo ""
    echo "Testing:"
    echo "  sfdc-test-all           - Run all tests"
    echo ""
    echo "Navigation:"
    echo "  sfdc-cd                 - Go to project root"
    echo "  sfdc-scripts            - Go to scripts directory"
    echo ""
    echo "Functions:"
    echo "  sfdc-query '<SOQL>'     - Run SOQL query"
    echo "  sfdc-deploy [path]      - Deploy metadata"
    echo ""
    echo "Shared Tools:"
    echo "  sfdc-task-sample [ORG] [DAYS] [LIMIT]     - Sample recent call Tasks"
    echo "  sfdc-duplicates-scan [ORG]                - Account/Contact duplicate scan (outputs JSON)"
    echo "  sfdc-deploy-reports [ORG] [DIR] [DASH]    - Deploy reports from JSON definitions"
    echo "  sfdc-data-pulse [ORG]                      - Safe data profile without COUNT(DISTINCT)/CASE"
    echo ""
    echo "Run 'alias | grep sfdc' to see all available aliases"
}

# Print success message
echo "✓ ClaudeSFDC aliases loaded. Type 'sfdc-help' for available commands."

# Shared tool wrappers
sfdc-task-sample() {
    source "${SCRIPTS_DIR}/lib/shell-commons.sh"
    local org="${1:-$(get_org_alias)}"
    local days="${2:-30}"
    local limit="${3:-5}"
    ORG_ALIAS="$org" DAYS="$days" LIMIT="$limit" "${CLAUDE_SFDC_DIR}/shared/tasks/quick-task-sampler.sh"
}

sfdc-duplicates-scan() {
    source "${SCRIPTS_DIR}/lib/shell-commons.sh"
    local org="${1:-$(get_org_alias)}"
    node "${CLAUDE_SFDC_DIR}/shared/data/duplicates-scan.js" --org "$org" --out "$PWD"
}

sfdc-deploy-reports() {
    source "${SCRIPTS_DIR}/lib/shell-commons.sh"
    local org="${1:-$(get_org_alias)}"
    local dir="${2:-${CLAUDE_SFDC_DIR}/instances/${org}/reports}"
    local dash="${3:-}"
    if [[ -n "$dash" ]]; then
        node "${CLAUDE_SFDC_DIR}/shared/reports/deploy-reports.js" --org "$org" --reports-dir "$dir" --dashboard "$dash"
    else
        node "${CLAUDE_SFDC_DIR}/shared/reports/deploy-reports.js" --org "$org" --reports-dir "$dir"
    fi
}

sfdc-data-pulse() {
    source "${SCRIPTS_DIR}/lib/shell-commons.sh"
    local org="${1:-$(get_org_alias)}"
    ORG_ALIAS="$org" "${CLAUDE_SFDC_DIR}/shared/audit/data-pulse.sh"
}
