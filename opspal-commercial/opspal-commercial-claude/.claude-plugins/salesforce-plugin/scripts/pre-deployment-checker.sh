#!/bin/bash

# Pre-Deployment Validation and Auto-Fix Script
# Validates Salesforce metadata before deployment and applies automatic fixes
# Prevents common deployment failures

set -e

# Source common libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/shell-commons.sh" 2>/dev/null || true
source "${SCRIPT_DIR}/lib/salesforce-deployment-utils.sh" 2>/dev/null || true

# Configuration
VALIDATOR_SCRIPT="${SCRIPT_DIR}/lib/metadata-validator.js"
REPORT_AUDIT_SCRIPT="${SCRIPT_DIR}/report-dashboard-format-audit.js"
TEMP_DIR="${SCRIPT_DIR}/../.temp/validation"
BACKUP_DIR="${SCRIPT_DIR}/../.backup/metadata"
LOG_FILE="${SCRIPT_DIR}/../logs/pre-deployment-$(date +%Y%m%d-%H%M%S).log"

# Create necessary directories
mkdir -p "$TEMP_DIR" "$BACKUP_DIR" "$(dirname "$LOG_FILE")"

# Logging functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "\033[0;32m✅ $1\033[0m" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "\033[1;33m⚠️  $1\033[0m" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "\033[0;31m❌ $1\033[0m" | tee -a "$LOG_FILE"
}

log_playbook_version() {
    local playbook_rel_path="$1"
    local repo_root="${SCRIPT_DIR}/.."
    local version="unknown"

    if command -v git >/dev/null 2>&1; then
        if git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
            version=$(git -C "$repo_root" log -1 --pretty=format:%h -- "$playbook_rel_path" 2>/dev/null)
            if [ -z "$version" ]; then
                version="untracked"
            fi
        fi
    fi

    log "Playbook version (${playbook_rel_path}): $version"
}

# Check if metadata validator exists
check_validator() {
    if [ ! -f "$VALIDATOR_SCRIPT" ]; then
        log_error "Metadata validator not found at: $VALIDATOR_SCRIPT"
        log "Installing metadata validator..."
        
        # Check if npm packages are installed
        if [ ! -d "${SCRIPT_DIR}/../node_modules/xml2js" ]; then
            log "Installing required npm packages..."
            cd "$SCRIPT_DIR/.."
            npm install xml2js --save 2>&1 | tee -a "$LOG_FILE"
        fi
        
        if [ ! -f "$VALIDATOR_SCRIPT" ]; then
            log_error "Failed to setup metadata validator"
            exit 1
        fi
    fi
}

# Validate a single metadata file
validate_file() {
    local file="$1"
    local auto_fix="${2:-false}"
    
    log "Validating: $(basename "$file")"
    
    # Create backup before any modifications
    local backup_file="${BACKUP_DIR}/$(basename "$file").$(date +%s)"
    cp "$file" "$backup_file"
    
    # Run validation
    local validation_output
    if [ "$auto_fix" = "true" ]; then
        validation_output=$(node "$VALIDATOR_SCRIPT" "$file" --apply-fixes 2>&1) || true
    else
        validation_output=$(node "$VALIDATOR_SCRIPT" "$file" 2>&1) || true
    fi
    
    # Parse validation results
    if echo "$validation_output" | grep -q "✅ Metadata is valid"; then
        log_success "Valid: $(basename "$file")"
        return 0
    elif echo "$validation_output" | grep -q "❌ Metadata validation failed"; then
        log_error "Invalid: $(basename "$file")"
        echo "$validation_output" >> "$LOG_FILE"
        
        if [ "$auto_fix" = "true" ] && echo "$validation_output" | grep -q "Applying fixes"; then
            log_warning "Fixes applied to: $(basename "$file")"
            return 0
        fi
        return 1
    else
        log_warning "Unknown validation result for: $(basename "$file")"
        echo "$validation_output" >> "$LOG_FILE"
        return 2
    fi
}

# Find and validate all metadata files
validate_directory() {
    local dir="$1"
    local auto_fix="${2:-false}"
    local file_pattern="${3:-*.xml}"
    
    if [ ! -d "$dir" ]; then
        log_error "Directory not found: $dir"
        return 1
    fi
    
    log "Scanning directory: $dir"
    
    local total_files=0
    local valid_files=0
    local fixed_files=0
    local invalid_files=0
    
    # Find all metadata files
    while IFS= read -r -d '' file; do
        ((total_files++))
        
        if validate_file "$file" "$auto_fix"; then
            ((valid_files++))
        else
            ((invalid_files++))
        fi
    done < <(find "$dir" -name "$file_pattern" -type f -print0)
    
    # Summary
    log "\n=== VALIDATION SUMMARY ==="
    log "Total files: $total_files"
    log_success "Valid: $valid_files"
    [ $fixed_files -gt 0 ] && log_warning "Fixed: $fixed_files"
    [ $invalid_files -gt 0 ] && log_error "Invalid: $invalid_files"
    
    return $([ $invalid_files -eq 0 ] && echo 0 || echo 1)
}

# Check for common issues before deployment
check_common_issues() {
    local metadata_dir="$1"
    local status=0

    log "\n=== CHECKING COMMON ISSUES ==="
    
    # Check API version consistency
    local api_versions=$(grep -h "<apiVersion>" "$metadata_dir"/**/*.xml 2>/dev/null | sort -u | wc -l)
    if [ "$api_versions" -gt 1 ]; then
        log_warning "Multiple API versions detected in metadata"
        grep -h "<apiVersion>" "$metadata_dir"/**/*.xml | sort -u | tee -a "$LOG_FILE"
    fi
    
    # Check for deprecated color palettes
    if grep -r "wildflowers" "$metadata_dir" 2>/dev/null; then
        log_warning "Deprecated color palette 'wildflowers' found"
    fi
    
    if ! run_dashboard_report_audit "$metadata_dir"; then
        status=1
    fi

    # Check for missing required fields
    log "Checking for missing required fields..."
    
    # Check metrics for indicator colors
    if grep -l "<componentType>Metric</componentType>" "$metadata_dir"/**/*.dashboard-meta.xml 2>/dev/null | while read -r file; do
        if ! grep -q "indicatorHighColor" "$file"; then
            log_warning "Metric component missing indicator colors in: $(basename "$file")"
        fi
    done | grep -q .; then
        :
    fi
    return $status
}

run_dashboard_report_audit() {
    local metadata_dir="$1"

    if [ ! -f "$REPORT_AUDIT_SCRIPT" ]; then
        log_warning "Dashboard report audit skipped (missing script: $REPORT_AUDIT_SCRIPT)"
        return 0
    fi

    local dashboards_present
    dashboards_present=$(find "$metadata_dir" -name "*.dashboard-meta.xml" -print -quit 2>/dev/null || true)
    if [ -z "$dashboards_present" ]; then
        log "No dashboard metadata found; skipping dashboard report audit."
        return 0
    fi

    log "Running dashboard report format audit..."
    local audit_output
    local audit_status
    set +e
    audit_output=$(node "$REPORT_AUDIT_SCRIPT" --metadata-dir "$metadata_dir" 2>&1)
    audit_status=$?
    set -e

    printf '%s\n' "$audit_output" >> "$LOG_FILE"

    if [ $audit_status -eq 0 ]; then
        log_success "Dashboard report format audit passed."
        return 0
    fi

    log_error "Dashboard report format audit detected issues. See details below."
    printf '%s\n' "$audit_output"
    return $audit_status
}

# Fix known issues automatically
auto_fix_issues() {
    local metadata_dir="$1"
    
    log "\n=== AUTO-FIXING KNOWN ISSUES ==="
    
    # Fix API version mismatches
    local target_version="${API_VERSION:-64.0}"
    log "Standardizing API version to: $target_version"
    
    find "$metadata_dir" -name "*.xml" -type f -exec sed -i.bak \
        "s/<apiVersion>[0-9.]*<\/apiVersion>/<apiVersion>$target_version<\/apiVersion>/g" {} \;
    
    # Fix invalid color palettes
    log "Fixing invalid color palettes..."
    find "$metadata_dir" -name "*.dashboard-meta.xml" -type f -exec sed -i.bak \
        "s/>wildflowers</>unity</g" {} \;
    
    # Fix invalid chart types
    log "Fixing invalid chart types..."
    find "$metadata_dir" -name "*.xml" -type f -exec sed -i.bak \
        "s/>Column</>VerticalColumn</g" {} \;
    
    # Fix date intervals
    log "Fixing date intervals..."
    find "$metadata_dir" -name "*.xml" -type f -exec sed -i.bak \
        -e "s/>THIS_YEAR</>INTERVAL_CURY</g" \
        -e "s/>LAST_YEAR</>INTERVAL_PREVY</g" \
        -e "s/>NEXT_90_DAYS</>INTERVAL_NEXT90</g" {} \;
    
    # Clean up backup files
    find "$metadata_dir" -name "*.bak" -type f -delete
    
    log_success "Auto-fix completed"
}

# Generate validation report
generate_report() {
    local metadata_dir="$1"
    local report_file="${2:-validation-report.html}"
    
    log "\n=== GENERATING VALIDATION REPORT ==="
    
    cat > "$report_file" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Pre-Deployment Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .success { color: green; }
        .warning { color: orange; }
        .error { color: red; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .summary { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>Pre-Deployment Validation Report</h1>
    <div class="summary">
        <h2>Summary</h2>
EOF
    
    # Add summary statistics
    echo "<p>Generated: $(date)</p>" >> "$report_file"
    echo "<p>Log file: $LOG_FILE</p>" >> "$report_file"
    
    # Add validation results
    if [ -f "$LOG_FILE" ]; then
        echo "<h2>Validation Details</h2><pre>" >> "$report_file"
        grep -E "(✅|⚠️|❌)" "$LOG_FILE" | tail -50 >> "$report_file"
        echo "</pre>" >> "$report_file"
    fi
    
    echo "</div></body></html>" >> "$report_file"
    
    log_success "Report generated: $report_file"
}

# Main execution
main() {
    local mode="${1:-validate}"
    local target="${2:-.}"
    local options="${3:-}"
    
    log "=== PRE-DEPLOYMENT VALIDATION STARTING ==="
    log "Mode: $mode"
    log "Target: $target"
    log "Options: $options"
    local playbook_path="docs/playbooks/pre-deployment-validation.md"
    log "Playbook: $playbook_path"
    log_playbook_version "$playbook_path"
    
    # Check prerequisites
    check_validator
    
    case "$mode" in
        validate)
            validate_directory "$target" false "*.xml"
            check_common_issues "$target"
            ;;
        
        fix)
            log "Running with auto-fix enabled..."
            auto_fix_issues "$target"
            validate_directory "$target" true "*.xml"
            ;;
        
        check)
            check_common_issues "$target"
            ;;
        
        report)
            validate_directory "$target" false "*.xml"
            check_common_issues "$target"
            generate_report "$target" "${options:-validation-report.html}"
            ;;
        
        help|--help|-h)
            cat << HELP
Pre-Deployment Validation Checker

Usage: $0 [mode] [target] [options]

Modes:
  validate  - Validate metadata files (default)
  fix       - Auto-fix known issues and validate
  check     - Check for common issues only
  report    - Generate HTML validation report
  help      - Show this help message

Examples:
  $0 validate ./force-app
  $0 fix ./force-app/main/default/dashboards
  $0 report . validation-report.html

Environment Variables:
  API_VERSION - Target API version for standardization (default: 64.0)
  AUTO_FIX    - Enable automatic fixes (true/false)

HELP
            exit 0
            ;;
        
        *)
            log_error "Unknown mode: $mode"
            log "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
    
    log "\n=== VALIDATION COMPLETE ==="
    log "Log file: $LOG_FILE"
}

# Run main function
main "$@"
