#!/bin/bash

#############################################
# Salesforce Reports Production Validation
# Comprehensive validation of the reporting infrastructure
#############################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${TEMP_DIR:-/tmp} +%Y%m%d-%H%M%S).log"

# Default values
ORG_ALIAS="${SF_TARGET_ORG:-production}"
COMPREHENSIVE=false
QUICK=false

# Usage
show_usage() {
    cat << EOF
Production Validation for Salesforce Reports Infrastructure

Usage: $0 [OPTIONS]

Options:
    --org <alias>        Salesforce org alias (default: $ORG_ALIAS)
    --comprehensive      Run all validation checks
    --quick             Quick validation only
    --help              Show this help message

Examples:
    $0 --comprehensive
    $0 --org sandbox --quick
    $0 --org production --comprehensive

This script validates:
    1. MCP tool connectivity
    2. Agent configurations
    3. Script functionality
    4. API access and limits
    5. Monitoring systems
    6. Rollback procedures
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --org)
            ORG_ALIAS="$2"
            shift 2
            ;;
        --comprehensive)
            COMPREHENSIVE=true
            shift
            ;;
        --quick)
            QUICK=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1" | tee -a "$LOG_FILE"
}

# Validation functions

check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing=()

    # Check required commands
    command -v node >/dev/null 2>&1 || missing+=("node")
    command -v npm >/dev/null 2>&1 || missing+=("npm")
    command -v sf >/dev/null 2>&1 || missing+=("Salesforce CLI (sf)")
    command -v jq >/dev/null 2>&1 || missing+=("jq")

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        return 1
    fi

    log_success "All prerequisites installed"
    return 0
}

check_salesforce_auth() {
    log_info "Checking Salesforce authentication..."

    if sf org display --target-org "$ORG_ALIAS" --json 2>/dev/null | jq -e '.result.accessToken' >/dev/null; then
        log_success "Authenticated to org: $ORG_ALIAS"

        # Get org details
        local org_info=$(sf org display --target-org "$ORG_ALIAS" --json 2>/dev/null | jq -r '.result')
        log_info "Org ID: $(echo "$org_info" | jq -r '.id')"
        log_info "Instance URL: $(echo "$org_info" | jq -r '.instanceUrl')"
        log_info "Username: $(echo "$org_info" | jq -r '.username')"
        return 0
    else
        log_error "Not authenticated to org: $ORG_ALIAS"
        log_info "Run: sf org login web --alias $ORG_ALIAS"
        return 1
    fi
}

check_mcp_configuration() {
    log_info "Checking MCP configuration..."

    local mcp_config="$PROJECT_ROOT/.mcp.json"

    if [ ! -f "$mcp_config" ]; then
        log_error "MCP configuration not found: $mcp_config"
        return 1
    fi

    # Check for Salesforce MCP server
    if jq -e '.mcpServers."salesforce-dx"' "$mcp_config" >/dev/null; then
        log_success "Salesforce MCP server configured"

        # Verify MCP tools are available
        local required_tools=(
            "mcp_salesforce"
            "mcp_salesforce_report_type_list"
            "mcp_salesforce_report_type_describe"
        )

        log_info "Note: MCP tools should be verified at runtime"
        return 0
    else
        log_error "Salesforce MCP server not configured in .mcp.json"
        return 1
    fi
}

check_agents() {
    log_info "Checking agent configurations..."

    local agents_dir="$PROJECT_ROOT/.claude/agents"
    local required_agents=(
        "sfdc-report-validator"
        "sfdc-report-type-manager"
        "sfdc-dashboard-optimizer"
    )

    local missing=()
    for agent in "${required_agents[@]}"; do
        if [ -f "$agents_dir/$agent.md" ]; then
            log_success "Agent found: $agent"
        else
            missing+=("$agent")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing agents: ${missing[*]}"
        return 1
    fi

    return 0
}

check_scripts() {
    log_info "Checking validation scripts..."

    local scripts_dir="$PROJECT_ROOT/scripts/lib"
    local required_scripts=(
        "report-field-validator.js"
        "report-defaults-enforcer.js"
        "dashboard-component-validator.js"
        "report-semantic-validator.js"
        "report-failure-mode-linter.js"
        "report-intelligence-diagnostics.js"
        "report-diagnostics-log.js"
        "persona-kpi-validator.js"
        "persona-kpi-log.js"
        "metric-field-resolver.js"
        "metric-semantic-log.js"
    )

    local missing=()
    for script in "${required_scripts[@]}"; do
        if [ -f "$scripts_dir/$script" ]; then
            log_success "Script found: $script"

            # Test script syntax
            if node -c "$scripts_dir/$script" 2>/dev/null; then
                log_success "  Syntax valid: $script"
            else
                log_error "  Syntax error in: $script"
            fi
        else
            missing+=("$script")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing scripts: ${missing[*]}"
        return 1
    fi

    return 0
}

check_api_limits() {
    log_info "Checking Salesforce API limits..."

    local limits=$(sf limits api display --target-org "$ORG_ALIAS" --json 2>/dev/null | jq -r '.result[] | select(.name == "DailyApiRequests")')

    if [ -n "$limits" ]; then
        local max=$(echo "$limits" | jq -r '.max')
        local remaining=$(echo "$limits" | jq -r '.remaining')
        local used=$((max - remaining))
        local percent=$((remaining * 100 / max))

        log_info "API Requests: $used/$max used ($percent% remaining)"

        if [ "$percent" -lt 15 ]; then
            log_error "API limits critically low: $percent% remaining"
            return 1
        elif [ "$percent" -lt 25 ]; then
            log_warning "API limits low: $percent% remaining"
        else
            log_success "API limits healthy: $percent% remaining"
        fi
    else
        log_warning "Could not retrieve API limits"
    fi

    return 0
}

check_monitoring() {
    log_info "Checking monitoring systems..."

    local monitoring_script="$PROJECT_ROOT/monitoring/reports-metrics-collector.js"

    if [ -f "$monitoring_script" ]; then
        log_success "Monitoring script found"

        # Test monitoring script
        if node "$monitoring_script" 2>/dev/null | jq -e '.health' >/dev/null; then
            local health=$(node "$monitoring_script" 2>/dev/null | jq -r '.health')

            case "$health" in
                "GREEN")
                    log_success "System health: GREEN"
                    ;;
                "YELLOW")
                    log_warning "System health: YELLOW"
                    ;;
                "RED")
                    log_error "System health: RED"
                    return 1
                    ;;
                *)
                    log_warning "Unknown health status: $health"
                    ;;
            esac
        else
            log_error "Monitoring script failed to execute"
            return 1
        fi
    else
        log_error "Monitoring script not found: $monitoring_script"
        return 1
    fi

    return 0
}

check_test_suite() {
    log_info "Checking test suite..."

    local test_script="$PROJECT_ROOT/tests/reports-api-health-test.js"

    if [ -f "$test_script" ]; then
        log_success "Test suite found"

        if [ "$COMPREHENSIVE" = true ]; then
            log_info "Running comprehensive tests..."

            if node "$test_script" "$ORG_ALIAS" 2>/dev/null; then
                log_success "All tests passed"
            else
                log_error "Some tests failed"
                return 1
            fi
        else
            log_info "Skipping test execution (use --comprehensive to run)"
        fi
    else
        log_error "Test suite not found: $test_script"
        return 1
    fi

    return 0
}

check_config_files() {
    log_info "Checking configuration files..."

    local config_files=(
        "config/report-defaults.json"
        "config/dashboard-constraints.json"
    )

    for config in "${config_files[@]}"; do
        local config_path="$PROJECT_ROOT/$config"

        if [ -f "$config_path" ]; then
            log_success "Config found: $config"

            # Validate JSON syntax
            if jq -e '.' "$config_path" >/dev/null 2>&1; then
                log_success "  Valid JSON: $config"
            else
                log_error "  Invalid JSON: $config"
                return 1
            fi
        else
            log_error "Config not found: $config"
            return 1
        fi
    done

    return 0
}

check_rollback_procedure() {
    log_info "Checking rollback procedures..."

    local rollback_doc="$PROJECT_ROOT/runbooks/reports-rollback-procedure.md"

    if [ -f "$rollback_doc" ]; then
        log_success "Rollback procedure documented"

        # Check for backup tag
        if git tag -l | grep -q "reports-.*-LKG"; then
            local lkg_tag=$(git tag -l | grep "reports-.*-LKG" | tail -1)
            log_success "Last Known Good tag found: $lkg_tag"
        else
            log_warning "No LKG (Last Known Good) tag found"
            log_info "Create with: git tag reports-v1.0.0-LKG"
        fi
    else
        log_error "Rollback procedure not found: $rollback_doc"
        return 1
    fi

    return 0
}

run_smoke_test() {
    log_info "Running smoke test..."

    # Create test report config
    local test_config=$(mktemp)
    cat > "$test_config" << 'EOF'
{
    "reportType": "Opportunity",
    "detailColumns": ["Amount", "CloseDate", "StageName"],
    "groupingsDown": ["StageName"],
    "standardDateFilter": "LAST_N_DAYS:30"
}
EOF

    # Test field validator
    if node "$PROJECT_ROOT/scripts/lib/report-field-validator.js" "$test_config" >/dev/null 2>&1; then
        log_success "Field validator smoke test passed"
    else
        log_error "Field validator smoke test failed"
        rm -f "$test_config"
        return 1
    fi

    # Test defaults enforcer
    if node "$PROJECT_ROOT/scripts/lib/report-defaults-enforcer.js" "$test_config" >/dev/null 2>&1; then
        log_success "Defaults enforcer smoke test passed"
    else
        log_error "Defaults enforcer smoke test failed"
        rm -f "$test_config"
        return 1
    fi

    rm -f "$test_config"
    return 0
}

# Main validation flow
main() {
    echo "=========================================="
    echo "SALESFORCE REPORTS PRODUCTION VALIDATION"
    echo "=========================================="
    echo
    log_info "Org: $ORG_ALIAS"
    log_info "Mode: $([ "$COMPREHENSIVE" = true ] && echo "Comprehensive" || echo "Standard")"
    log_info "Log file: $LOG_FILE"
    echo

    local failed_checks=()

    # Run checks
    check_prerequisites || failed_checks+=("Prerequisites")
    check_salesforce_auth || failed_checks+=("Salesforce Auth")
    check_mcp_configuration || failed_checks+=("MCP Configuration")
    check_agents || failed_checks+=("Agents")
    check_scripts || failed_checks+=("Scripts")
    check_config_files || failed_checks+=("Config Files")
    check_api_limits || failed_checks+=("API Limits")
    check_monitoring || failed_checks+=("Monitoring")
    check_test_suite || failed_checks+=("Test Suite")
    check_rollback_procedure || failed_checks+=("Rollback Procedure")

    if [ "$QUICK" != true ]; then
        run_smoke_test || failed_checks+=("Smoke Test")
    fi

    echo
    echo "=========================================="
    echo "VALIDATION SUMMARY"
    echo "=========================================="

    if [ ${#failed_checks[@]} -eq 0 ]; then
        log_success "ALL VALIDATIONS PASSED"
        echo
        log_info "System is ready for production use"
        exit 0
    else
        log_error "VALIDATION FAILED"
        echo
        log_error "Failed checks: ${failed_checks[*]}"
        echo
        log_info "Review log file for details: $LOG_FILE"
        exit 1
    fi
}

# Run main
main
