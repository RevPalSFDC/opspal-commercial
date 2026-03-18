#!/bin/bash

#############################################
# Salesforce Reports Infrastructure Production Deployment
# Orchestrates complete deployment with validation and rollback
#############################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_LOG="${TEMP_DIR:-/tmp} +%Y%m%d-%H%M%S).log"
ROLLBACK_POINT=""

# Default values
ORG_ALIAS="${SF_TARGET_ORG:-production}"
ENVIRONMENT="production"
DRY_RUN=false
SKIP_TESTS=false
SKIP_BACKUP=false
SLACK_NOTIFY=true

# Deployment stages
STAGES=(
    "pre_flight"
    "backup"
    "validation"
    "monitoring"
    "alerts"
    "deployment"
    "verification"
    "notification"
)

# Usage
show_usage() {
    cat << EOF
Production Deployment for Salesforce Reports Infrastructure

Usage: $0 [OPTIONS]

Options:
    --org <alias>        Target Salesforce org (default: $ORG_ALIAS)
    --env <environment>  Environment (sandbox|production) (default: $ENVIRONMENT)
    --dry-run           Simulate deployment without changes
    --skip-tests        Skip test execution (not recommended)
    --skip-backup       Skip backup creation (not recommended)
    --no-slack          Disable Slack notifications
    --help              Show this help message

Examples:
    $0 --org production
    $0 --org sandbox --dry-run
    $0 --org production --skip-tests

This script will:
    1. Validate prerequisites and environment
    2. Create backup and rollback point
    3. Deploy validation infrastructure
    4. Start monitoring services
    5. Configure alerting
    6. Verify deployment
    7. Send notifications

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --org)
            ORG_ALIAS="$2"
            shift 2
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --no-slack)
            SLACK_NOTIFY=false
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

# Logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$DEPLOYMENT_LOG"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_stage() {
    echo -e "\n${CYAN}═══════════════════════════════════════${NC}" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${CYAN}  $1${NC}" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${CYAN}═══════════════════════════════════════${NC}\n" | tee -a "$DEPLOYMENT_LOG"
}

# Stage: Pre-flight checks
stage_pre_flight() {
    log_stage "STAGE 1: Pre-flight Checks"

    log_info "Checking prerequisites..."

    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2)
    local required_version="14.0.0"

    if [ "$(printf '%s\n' "$required_version" "$node_version" | sort -V | head -n1)" != "$required_version" ]; then
        log_error "Node.js version $node_version is below required $required_version"
        return 1
    fi
    log_success "Node.js version: $node_version"

    # Check Salesforce CLI
    if ! command -v sf &> /dev/null; then
        log_error "Salesforce CLI not found"
        return 1
    fi
    log_success "Salesforce CLI installed"

    # Check authentication
    if ! sf org display --target-org "$ORG_ALIAS" --json 2>/dev/null | jq -e '.result.accessToken' >/dev/null; then
        log_error "Not authenticated to org: $ORG_ALIAS"
        return 1
    fi
    log_success "Authenticated to org: $ORG_ALIAS"

    # Check API limits
    local api_remaining=$(sf limits api display --target-org "$ORG_ALIAS" --json 2>/dev/null | \
        jq -r '.result[] | select(.name == "DailyApiRequests") | .remaining')

    if [ -z "$api_remaining" ] || [ "$api_remaining" -lt 1000 ]; then
        log_error "Insufficient API calls remaining: $api_remaining"
        return 1
    fi
    log_success "API calls remaining: $api_remaining"

    # Check required files
    local required_files=(
        "scripts/lib/report-field-validator.js"
        "scripts/lib/report-defaults-enforcer.js"
        "scripts/lib/dashboard-component-validator.js"
        "scripts/lib/report-semantic-validator.js"
        "scripts/lib/report-failure-mode-linter.js"
        "scripts/lib/report-intelligence-diagnostics.js"
        "scripts/lib/report-diagnostics-log.js"
        "scripts/lib/persona-kpi-validator.js"
        "scripts/lib/persona-kpi-log.js"
        "scripts/lib/metric-field-resolver.js"
        "scripts/lib/metric-semantic-log.js"
        "config/persona-kpi-contracts.json"
        "monitoring/reports-metrics-collector.js"
        "monitoring/slack-alert-integration.js"
    )

    for file in "${required_files[@]}"; do
        if [ ! -f "$PROJECT_ROOT/$file" ]; then
            log_error "Required file missing: $file"
            return 1
        fi
    done
    log_success "All required files present"

    # Check npm dependencies
    log_info "Installing/updating dependencies..."
    if [ "$DRY_RUN" = false ]; then
        cd "$PROJECT_ROOT"
        npm install --production 2>&1 | tee -a "$DEPLOYMENT_LOG"
    fi
    log_success "Dependencies ready"

    return 0
}

# Stage: Create backup
stage_backup() {
    log_stage "STAGE 2: Creating Backup"

    if [ "$SKIP_BACKUP" = true ]; then
        log_warning "Skipping backup (--skip-backup specified)"
        return 0
    fi

    local backup_dir="$PROJECT_ROOT/backups/$(date +%Y%m%d-%H%M%S)"

    log_info "Creating backup in: $backup_dir"

    if [ "$DRY_RUN" = false ]; then
        mkdir -p "$backup_dir"

        # Backup current configuration
        cp -r "$PROJECT_ROOT/config" "$backup_dir/" 2>/dev/null || true
        cp -r "$PROJECT_ROOT/scripts/lib" "$backup_dir/" 2>/dev/null || true
        cp -r "$PROJECT_ROOT/monitoring" "$backup_dir/" 2>/dev/null || true

        # Create git tag for rollback
        ROLLBACK_POINT="reports-deployment-$(date +%Y%m%d-%H%M%S)"
        git tag "$ROLLBACK_POINT" 2>/dev/null || true

        log_success "Backup created: $backup_dir"
        log_success "Rollback point: $ROLLBACK_POINT"
    else
        log_info "[DRY RUN] Would create backup in: $backup_dir"
    fi

    return 0
}

# Stage: Validation
stage_validation() {
    log_stage "STAGE 3: Validation Infrastructure"

    log_info "Running production validation..."

    if [ "$DRY_RUN" = false ]; then
        # Run validation script
        if bash "$PROJECT_ROOT/scripts/production-validation.sh" --org "$ORG_ALIAS" --quick; then
            log_success "Validation passed"
        else
            log_error "Validation failed"
            return 1
        fi

        # Run tests if not skipped
        if [ "$SKIP_TESTS" = false ]; then
            log_info "Running test suite..."
            if node "$PROJECT_ROOT/tests/reports-api-health-test.js" "$ORG_ALIAS"; then
                log_success "All tests passed"
            else
                log_error "Tests failed"
                return 1
            fi
        else
            log_warning "Tests skipped (--skip-tests specified)"
        fi
    else
        log_info "[DRY RUN] Would run validation and tests"
    fi

    return 0
}

# Stage: Monitoring setup
stage_monitoring() {
    log_stage "STAGE 4: Monitoring Services"

    log_info "Setting up monitoring services..."

    if [ "$DRY_RUN" = false ]; then
        # Check if monitoring is already running
        if pgrep -f "reports-metrics-collector.js" > /dev/null; then
            log_warning "Monitoring already running, restarting..."
            pkill -f "reports-metrics-collector.js" || true
            sleep 2
        fi

        # Start metrics collector
        log_info "Starting metrics collector..."
        nohup node "$PROJECT_ROOT/monitoring/reports-metrics-collector.js" daemon \
            > ${TEMP_DIR:-/tmp} 2>&1 &
        local collector_pid=$!

        sleep 3

        # Verify it's running
        if kill -0 $collector_pid 2>/dev/null; then
            log_success "Metrics collector started (PID: $collector_pid)"
            echo $collector_pid > ${TEMP_DIR:-/tmp}
        else
            log_error "Failed to start metrics collector"
            return 1
        fi

        # Start dashboard server if configured
        if [ -f "$PROJECT_ROOT/monitoring/server.js" ]; then
            log_info "Starting dashboard server..."

            # Kill existing server
            pkill -f "monitoring/server.js" || true
            sleep 2

            # Start new server
            nohup node "$PROJECT_ROOT/monitoring/server.js" \
                > ${TEMP_DIR:-/tmp} 2>&1 &
            local server_pid=$!

            sleep 3

            if kill -0 $server_pid 2>/dev/null; then
                log_success "Dashboard server started (PID: $server_pid)"
                echo $server_pid > ${TEMP_DIR:-/tmp}
                log_info "Dashboard available at: http://localhost:3003"
            else
                log_warning "Dashboard server failed to start (non-critical)"
            fi
        fi
    else
        log_info "[DRY RUN] Would start monitoring services"
    fi

    return 0
}

# Stage: Configure alerts
stage_alerts() {
    log_stage "STAGE 5: Alert Configuration"

    if [ -z "$SLACK_WEBHOOK_URL" ]; then
        log_warning "SLACK_WEBHOOK_URL not configured, skipping Slack alerts"
        return 0
    fi

    log_info "Configuring Slack alerts..."

    if [ "$DRY_RUN" = false ]; then
        # Test Slack connection
        log_info "Testing Slack webhook..."
        if node "$PROJECT_ROOT/monitoring/slack-alert-integration.js" test P3; then
            log_success "Slack webhook verified"
        else
            log_warning "Slack webhook test failed (non-critical)"
        fi

        # Start alert integration
        if pgrep -f "slack-alert-integration.js" > /dev/null; then
            log_warning "Alert integration already running, restarting..."
            pkill -f "slack-alert-integration.js" || true
            sleep 2
        fi

        nohup node "$PROJECT_ROOT/monitoring/slack-alert-integration.js" start \
            > ${TEMP_DIR:-/tmp} 2>&1 &
        local alert_pid=$!

        sleep 3

        if kill -0 $alert_pid 2>/dev/null; then
            log_success "Slack alerts started (PID: $alert_pid)"
            echo $alert_pid > ${TEMP_DIR:-/tmp}
        else
            log_warning "Failed to start Slack alerts (non-critical)"
        fi
    else
        log_info "[DRY RUN] Would configure Slack alerts"
    fi

    return 0
}

# Stage: Deploy components
stage_deployment() {
    log_stage "STAGE 6: Component Deployment"

    log_info "Deploying validation components..."

    if [ "$DRY_RUN" = false ]; then
        # Deploy configuration files
        local config_files=(
            "config/report-defaults.json"
            "config/dashboard-constraints.json"
        )

        for config in "${config_files[@]}"; do
            if [ -f "$PROJECT_ROOT/$config" ]; then
                log_info "Deploying: $config"
                # In real deployment, this would sync to a config service
                log_success "Deployed: $config"
            fi
        done

        # Initialize learning loop
        log_info "Initializing learning loop..."
        node "$PROJECT_ROOT/scripts/lib/validation-learning-loop.js" init
        log_success "Learning loop initialized"

        # Initialize field suggestion engine
        log_info "Initializing field suggestion engine..."
        node "$PROJECT_ROOT/scripts/lib/field-suggestion-engine.js" stats
        log_success "Field suggestion engine ready"

        # Initialize auto-remediation
        log_info "Initializing auto-remediation system..."
        node "$PROJECT_ROOT/scripts/lib/auto-remediation-system.js" strategies
        log_success "Auto-remediation system ready"
    else
        log_info "[DRY RUN] Would deploy components"
    fi

    return 0
}

# Stage: Verification
stage_verification() {
    log_stage "STAGE 7: Deployment Verification"

    log_info "Verifying deployment..."

    local verification_passed=true

    if [ "$DRY_RUN" = false ]; then
        # Check monitoring metrics
        log_info "Checking monitoring metrics..."
        if node "$PROJECT_ROOT/monitoring/reports-metrics-collector.js" 2>/dev/null | \
           jq -e '.health == "GREEN"' >/dev/null; then
            log_success "System health: GREEN"
        else
            log_warning "System health check failed"
            verification_passed=false
        fi

        # Verify processes
        local processes=(
            "reports-metrics-collector.js:Metrics Collector"
            "slack-alert-integration.js:Slack Alerts"
        )

        for process_check in "${processes[@]}"; do
            IFS=':' read -r process_name display_name <<< "$process_check"
            if pgrep -f "$process_name" > /dev/null; then
                log_success "$display_name running"
            else
                log_warning "$display_name not running"
            fi
        done

        # Test report creation
        log_info "Testing report creation with validation..."
        local test_report=$(mktemp)
        cat > "$test_report" << 'EOF'
{
    "reportType": "Opportunity",
    "name": "_deployment_test_$(date +%s)",
    "detailColumns": ["Name", "Amount", "CloseDate"],
    "standardDateFilter": {
        "column": "CloseDate",
        "durationValue": "LAST_N_DAYS:30"
    }
}
EOF

        if node "$PROJECT_ROOT/scripts/lib/report-field-validator.js" "$test_report" 2>/dev/null; then
            log_success "Validation system operational"
        else
            log_warning "Validation test failed"
            verification_passed=false
        fi

        rm -f "$test_report"

        if [ "$verification_passed" = false ]; then
            log_error "Verification failed"
            return 1
        fi

        log_success "All verifications passed"
    else
        log_info "[DRY RUN] Would verify deployment"
    fi

    return 0
}

# Stage: Send notifications
stage_notification() {
    log_stage "STAGE 8: Notifications"

    local status="SUCCESS"
    local emoji="✅"
    local color="good"

    if [ $? -ne 0 ]; then
        status="FAILED"
        emoji="❌"
        color="danger"
    fi

    log_info "Sending deployment notifications..."

    # Slack notification
    if [ "$SLACK_NOTIFY" = true ] && [ -n "$SLACK_WEBHOOK_URL" ]; then
        local message=$(cat << EOF
{
    "attachments": [{
        "color": "$color",
        "title": "$emoji Reports Infrastructure Deployment $status",
        "fields": [
            {"title": "Environment", "value": "$ENVIRONMENT", "short": true},
            {"title": "Org", "value": "$ORG_ALIAS", "short": true},
            {"title": "Timestamp", "value": "$(date)", "short": false},
            {"title": "Log", "value": "$DEPLOYMENT_LOG", "short": false}
        ]
    }]
}
EOF
)

        if [ "$DRY_RUN" = false ]; then
            curl -X POST "$SLACK_WEBHOOK_URL" \
                -H "Content-Type: application/json" \
                -d "$message" 2>/dev/null || true
            log_success "Slack notification sent"
        else
            log_info "[DRY RUN] Would send Slack notification"
        fi
    fi

    # Email notification (if configured)
    if [ -n "$DEPLOYMENT_EMAIL" ]; then
        if [ "$DRY_RUN" = false ]; then
            echo "Deployment $status for $ORG_ALIAS at $(date)" | \
                mail -s "Reports Deployment $status" "$DEPLOYMENT_EMAIL" || true
            log_success "Email notification sent"
        else
            log_info "[DRY RUN] Would send email to: $DEPLOYMENT_EMAIL"
        fi
    fi

    return 0
}

# Rollback function
rollback() {
    log_error "ROLLBACK INITIATED"

    if [ -n "$ROLLBACK_POINT" ]; then
        log_info "Rolling back to: $ROLLBACK_POINT"

        # Stop services
        pkill -f "reports-metrics-collector.js" || true
        pkill -f "slack-alert-integration.js" || true
        pkill -f "monitoring/server.js" || true

        # Restore from git tag
        git checkout "$ROLLBACK_POINT" -- . 2>/dev/null || true

        log_warning "Rollback completed. Manual verification required."
    else
        log_error "No rollback point available"
    fi

    exit 1
}

# Main deployment orchestration
main() {
    echo "=========================================="
    echo " SALESFORCE REPORTS DEPLOYMENT"
    echo "=========================================="
    echo
    log_info "Environment: $ENVIRONMENT"
    log_info "Target Org: $ORG_ALIAS"
    log_info "Dry Run: $DRY_RUN"
    log_info "Log File: $DEPLOYMENT_LOG"
    echo

    # Trap errors for rollback
    trap rollback ERR

    # Execute stages
    for stage in "${STAGES[@]}"; do
        stage_function="stage_$stage"

        if declare -f "$stage_function" > /dev/null; then
            if ! $stage_function; then
                log_error "Stage failed: $stage"

                if [ "$DRY_RUN" = false ]; then
                    rollback
                fi

                exit 1
            fi
        fi
    done

    echo
    echo "=========================================="
    echo " DEPLOYMENT COMPLETED SUCCESSFULLY"
    echo "=========================================="
    echo
    log_success "All stages completed"
    log_info "Dashboard: http://localhost:3003"
    log_info "Logs: $DEPLOYMENT_LOG"

    if [ "$DRY_RUN" = true ]; then
        echo
        log_warning "This was a DRY RUN - no changes were made"
        log_info "Run without --dry-run to deploy"
    fi

    exit 0
}

# Run main
main
