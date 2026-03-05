#!/bin/bash

# Salesforce Deployment Pipeline Orchestrator
# Coordinates validation, deployment, and verification for reports/dashboards
# Handles complex multi-step deployments with rollback capabilities
#
# Updated: 2026-01-15 - Fixed silent fallback patterns, added standardized exit codes
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Success
#   1 - Validation or deployment error
#   3 - Transient error (retry-able)

set -e

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized exit codes
if [[ -f "${SCRIPT_DIR}/lib/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR}/lib/sf-exit-codes.sh"
else
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
    EXIT_TRANSIENT_ERROR=3
fi

source "${SCRIPT_DIR}/lib/shell-commons.sh" 2>/dev/null || true
source "${SCRIPT_DIR}/lib/salesforce-deployment-utils.sh"

# Pipeline configuration
PIPELINE_LOG="${SCRIPT_DIR}/../logs/pipeline-$(date +%Y%m%d-%H%M%S).log"
BACKUP_DIR="${SCRIPT_DIR}/../.backup/pipeline"
STATE_FILE="${SCRIPT_DIR}/../.state/pipeline-state.json"
VALIDATION_REPORT="${SCRIPT_DIR}/../reports/validation-report.html"

# Create necessary directories
mkdir -p "$(dirname "$PIPELINE_LOG")" "$BACKUP_DIR" "$(dirname "$STATE_FILE")" "$(dirname "$VALIDATION_REPORT")"

# Pipeline state management
save_state() {
    local step="$1"
    local status="$2"
    local details="$3"
    
    cat > "$STATE_FILE" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "step": "$step",
    "status": "$status",
    "details": "$details",
    "backup_dir": "$BACKUP_DIR",
    "log_file": "$PIPELINE_LOG"
}
EOF
}

# Rollback function
rollback_deployment() {
    local backup_id="$1"
    local org_alias="${2:-$(get_org_alias)}"
    
    log_warning "Initiating rollback..."
    
    if [ -z "$backup_id" ]; then
        backup_id=$(ls -t "$BACKUP_DIR" | head -1)
    fi
    
    local backup_path="${BACKUP_DIR}/${backup_id}"
    
    if [ ! -d "$backup_path" ]; then
        log_error "Backup not found: $backup_path"
        return 1
    fi
    
    log_info "Rolling back from backup: $backup_id"
    
    # Deploy backup metadata
    sf project deploy start \
        --source-dir "$backup_path" \
        --target-org "$org_alias" \
        --wait 10 \
        --ignore-conflicts
    
    log_success "Rollback completed"
    save_state "rollback" "completed" "Restored from $backup_id"
    
    return 0
}

# Backup current metadata
backup_metadata() {
    local source_dir="$1"
    local backup_id="$(date +%Y%m%d-%H%M%S)"
    local backup_path="${BACKUP_DIR}/${backup_id}"
    
    log_info "Creating backup: $backup_id"
    
    mkdir -p "$backup_path"
    
    # Copy current metadata
    if [ -d "$source_dir" ]; then
        cp -r "$source_dir"/* "$backup_path/" 2>/dev/null || true
    fi
    
    log_success "Backup created at: $backup_path"
    echo "$backup_id"
}

# Phase 1: Validation
phase_validation() {
    local metadata_dir="$1"
    local auto_fix="${2:-true}"
    
    log_info "=== PHASE 1: VALIDATION ==="
    save_state "validation" "started" "Validating metadata"
    
    # Run pre-deployment checker
    if [ -f "${SCRIPT_DIR}/pre-deployment-checker.sh" ]; then
        if [ "$auto_fix" = "true" ]; then
            "${SCRIPT_DIR}/pre-deployment-checker.sh" fix "$metadata_dir"
        else
            "${SCRIPT_DIR}/pre-deployment-checker.sh" validate "$metadata_dir"
        fi
        
        local validation_result=$?
        
        if [ $validation_result -eq 0 ]; then
            log_success "Validation passed"
            save_state "validation" "completed" "All validations passed"
            return 0
        else
            log_error "Validation failed"
            save_state "validation" "failed" "Validation errors found"
            return 1
        fi
    else
        log_warning "Pre-deployment checker not found, skipping validation"
        save_state "validation" "skipped" "Checker not available"
        return 0
    fi
}

# Phase 2: Report Deployment
phase_deploy_reports() {
    local metadata_dir="$1"
    local org_alias="${2:-$(get_org_alias)}"
    
    log_info "=== PHASE 2: REPORT DEPLOYMENT ==="
    save_state "report_deployment" "started" "Deploying reports"
    
    # Find report files
    local report_count=$(find "$metadata_dir" -name "*.report-meta.xml" -type f 2>/dev/null | wc -l)
    
    if [ $report_count -eq 0 ]; then
        log_info "No reports to deploy"
        save_state "report_deployment" "skipped" "No reports found"
        return 0
    fi
    
    log_info "Found $report_count reports to deploy"
    
    # Deploy reports with retry
    if deploy_with_auto_fix "$metadata_dir" "$org_alias" 3; then
        log_success "Reports deployed successfully"
        save_state "report_deployment" "completed" "Deployed $report_count reports"
        return 0
    else
        log_error "Report deployment failed"
        save_state "report_deployment" "failed" "Failed to deploy reports"
        return 1
    fi
}

# Phase 3: Dashboard Deployment
phase_deploy_dashboards() {
    local metadata_dir="$1"
    local org_alias="${2:-$(get_org_alias)}"
    
    log_info "=== PHASE 3: DASHBOARD DEPLOYMENT ==="
    save_state "dashboard_deployment" "started" "Deploying dashboards"
    
    # Find dashboard files
    local dashboard_count=$(find "$metadata_dir" -name "*.dashboard-meta.xml" -type f 2>/dev/null | wc -l)
    
    if [ $dashboard_count -eq 0 ]; then
        log_info "No dashboards to deploy"
        save_state "dashboard_deployment" "skipped" "No dashboards found"
        return 0
    fi
    
    log_info "Found $dashboard_count dashboards to deploy"
    
    # Wait for reports to be fully available
    log_info "Waiting for report availability..."
    sleep 10
    
    # Deploy dashboards with enhanced error handling
    if deploy_reports_dashboards "$metadata_dir" "$org_alias" true; then
        log_success "Dashboards deployed successfully"
        save_state "dashboard_deployment" "completed" "Deployed $dashboard_count dashboards"
        return 0
    else
        log_error "Dashboard deployment failed"
        save_state "dashboard_deployment" "failed" "Failed to deploy dashboards"
        return 1
    fi
}

# Phase 4: Verification
phase_verification() {
    local org_alias="${1:-$(get_org_alias)}"
    local expected_reports="${2:-}"
    local expected_dashboards="${3:-}"

    log_info "=== PHASE 4: VERIFICATION ==="
    save_state "verification" "started" "Verifying deployment"

    local verification_passed=true

    # Verify reports if specified
    if [ -n "$expected_reports" ]; then
        log_info "Verifying reports..."

        for report in $expected_reports; do
            local query="SELECT Id, Name FROM Report WHERE DeveloperName = '$report' LIMIT 1"
            local result=""
            local query_exit=0

            # Execute query with proper error handling (no silent fallback)
            result=$(sf data query --query "$query" --target-org "$org_alias" --json 2>&1) || query_exit=$?

            if [ $query_exit -ne 0 ]; then
                log_warning "Query failed for report $report (exit code: $query_exit)"
                # Check if it's a transient error vs permanent
                if echo "$result" | grep -qE "ECONNRESET|ETIMEDOUT|503|502"; then
                    log_warning "Transient error detected, treating as unverified"
                fi
                verification_passed=false
                continue
            fi

            if echo "$result" | grep -q '"totalSize":1'; then
                log_success "Report verified: $report"
            else
                log_error "Report not found: $report"
                verification_passed=false
            fi
        done
    fi

    # Verify dashboards if specified
    if [ -n "$expected_dashboards" ]; then
        log_info "Verifying dashboards..."

        for dashboard in $expected_dashboards; do
            local query="SELECT Id, Title FROM Dashboard WHERE DeveloperName = '$dashboard' LIMIT 1"
            local result=""
            local query_exit=0

            # Execute query with proper error handling (no silent fallback)
            result=$(sf data query --query "$query" --target-org "$org_alias" --json 2>&1) || query_exit=$?

            if [ $query_exit -ne 0 ]; then
                log_warning "Query failed for dashboard $dashboard (exit code: $query_exit)"
                verification_passed=false
                continue
            fi

            if echo "$result" | grep -q '"totalSize":1'; then
                log_success "Dashboard verified: $dashboard"
            else
                log_error "Dashboard not found: $dashboard"
                verification_passed=false
            fi
        done
    fi
    
    if [ "$verification_passed" = "true" ]; then
        log_success "Verification completed successfully"
        save_state "verification" "completed" "All components verified"
        return 0
    else
        log_error "Verification failed"
        save_state "verification" "failed" "Some components not found"
        return 1
    fi
}

# Generate deployment report
generate_deployment_report() {
    local report_file="${1:-$VALIDATION_REPORT}"
    
    log_info "Generating deployment report..."
    
    cat > "$report_file" << 'HTML'
<!DOCTYPE html>
<html>
<head>
    <title>Deployment Pipeline Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #00a1e0; border-bottom: 2px solid #00a1e0; padding-bottom: 10px; }
        h2 { color: #333; margin-top: 30px; }
        .phase { margin: 20px 0; padding: 15px; border-left: 4px solid #ddd; background: #fafafa; }
        .phase.success { border-color: #4caf50; }
        .phase.failed { border-color: #f44336; }
        .phase.warning { border-color: #ff9800; }
        .status { display: inline-block; padding: 5px 10px; border-radius: 4px; color: white; font-weight: bold; }
        .status.success { background: #4caf50; }
        .status.failed { background: #f44336; }
        .status.warning { background: #ff9800; }
        .status.skipped { background: #9e9e9e; }
        .timestamp { color: #666; font-size: 0.9em; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f0f0f0; font-weight: bold; }
        .log-section { background: #f5f5f5; padding: 10px; border-radius: 4px; margin: 10px 0; font-family: monospace; font-size: 0.9em; max-height: 300px; overflow-y: auto; }
        .summary { background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .actions { margin: 20px 0; }
        .button { display: inline-block; padding: 10px 20px; background: #00a1e0; color: white; text-decoration: none; border-radius: 4px; margin-right: 10px; }
        .button:hover { background: #0087c3; }
        .metrics { display: flex; justify-content: space-around; margin: 20px 0; }
        .metric { text-align: center; padding: 20px; background: #f9f9f9; border-radius: 4px; flex: 1; margin: 0 10px; }
        .metric .value { font-size: 2em; font-weight: bold; color: #00a1e0; }
        .metric .label { color: #666; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Deployment Pipeline Report</h1>
        <div class="timestamp">Generated: $(date)</div>
        
        <div class="summary">
            <h2>Summary</h2>
HTML
    
    # Add pipeline state
    if [ -f "$STATE_FILE" ]; then
        local state=$(cat "$STATE_FILE")
        echo "<pre>$state</pre>" >> "$report_file"
    fi
    
    # Add metrics
    cat >> "$report_file" << 'HTML'
        </div>
        
        <div class="metrics">
            <div class="metric">
                <div class="value" id="reports-count">0</div>
                <div class="label">Reports</div>
            </div>
            <div class="metric">
                <div class="value" id="dashboards-count">0</div>
                <div class="label">Dashboards</div>
            </div>
            <div class="metric">
                <div class="value" id="duration">0m</div>
                <div class="label">Duration</div>
            </div>
            <div class="metric">
                <div class="value" id="success-rate">0%</div>
                <div class="label">Success Rate</div>
            </div>
        </div>
        
        <h2>Pipeline Phases</h2>
HTML
    
    # Add log excerpts
    if [ -f "$PIPELINE_LOG" ]; then
        echo '<div class="log-section">' >> "$report_file"
        tail -100 "$PIPELINE_LOG" | sed 's/</\&lt;/g; s/>/\&gt;/g' >> "$report_file"
        echo '</div>' >> "$report_file"
    fi
    
    # Close HTML
    cat >> "$report_file" << 'HTML'
        <div class="actions">
            <a href="#" class="button" onclick="window.print(); return false;">Print Report</a>
            <a href="#" class="button" onclick="location.reload(); return false;">Refresh</a>
        </div>
    </div>
</body>
</html>
HTML
    
    log_success "Report generated: $report_file"
}

# Main pipeline execution
run_pipeline() {
    local mode="${1:-full}"
    local metadata_dir="${2:-.}"
    local org_alias="${3:-$(get_org_alias)}"
    local options="${4:-}"
    
    log_info "=== DEPLOYMENT PIPELINE STARTING ==="
    log_info "Mode: $mode"
    log_info "Directory: $metadata_dir"
    log_info "Org: $org_alias"
    
    # Start timing
    local start_time=$(date +%s)
    
    # Create backup
    local backup_id=$(backup_metadata "$metadata_dir")
    
    # Track pipeline success
    local pipeline_success=true
    
    case "$mode" in
        full)
            # Run all phases
            if phase_validation "$metadata_dir" true; then
                if phase_deploy_reports "$metadata_dir" "$org_alias"; then
                    if phase_deploy_dashboards "$metadata_dir" "$org_alias"; then
                        phase_verification "$org_alias"
                    else
                        pipeline_success=false
                    fi
                else
                    pipeline_success=false
                fi
            else
                pipeline_success=false
            fi
            ;;
        
        validate-only)
            phase_validation "$metadata_dir" false
            ;;
        
        reports-only)
            phase_validation "$metadata_dir" true
            phase_deploy_reports "$metadata_dir" "$org_alias"
            ;;
        
        dashboards-only)
            phase_validation "$metadata_dir" true
            phase_deploy_dashboards "$metadata_dir" "$org_alias"
            ;;
        
        rollback)
            rollback_deployment "$options" "$org_alias"
            ;;
        
        help|--help|-h)
            cat << HELP
Deployment Pipeline Orchestrator

Usage: $0 [mode] [metadata_dir] [org_alias] [options]

Modes:
  full           - Run complete pipeline (default)
  validate-only  - Run validation phase only
  reports-only   - Deploy reports only
  dashboards-only - Deploy dashboards only
  rollback       - Rollback to previous deployment
  help          - Show this help message

Examples:
  $0 full ./force-app myorg
  $0 validate-only ./metadata
  $0 rollback . myorg 20240101-120000

Environment Variables:
  SF_TARGET_ORG - Default org alias
  API_VERSION - Target API version

HELP
            exit 0
            ;;
        
        *)
            log_error "Unknown mode: $mode"
            exit 1
            ;;
    esac
    
    # Calculate duration
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Generate report
    generate_deployment_report
    
    # Final status
    log_info "=== PIPELINE COMPLETE ==="
    log_info "Duration: ${duration} seconds"
    log_info "Backup ID: $backup_id"
    log_info "Report: $VALIDATION_REPORT"
    
    if [ "$pipeline_success" = "true" ]; then
        log_success "Pipeline executed successfully"
        save_state "complete" "success" "Pipeline completed in ${duration}s"
        exit 0
    else
        log_error "Pipeline failed - rollback available with: $0 rollback . $org_alias $backup_id"
        save_state "complete" "failed" "Pipeline failed after ${duration}s"
        exit 1
    fi
}

# Execute pipeline
run_pipeline "$@"