#!/bin/bash

##############################################################################
# unified-system-validator.sh - Consolidated System Validation Framework
##############################################################################
# This script consolidates functionality from:
# - validate-file-placement.sh (file structure validation)
# - test-verification-system.sh (system health checks)
# - verify-field-accessibility.sh (field access validation)
#
# Provides comprehensive system validation with:
# - Project structure and file placement validation
# - Salesforce system health and connectivity checks
# - Field accessibility and permission validation
# - Configuration integrity checks
# - Performance and optimization analysis
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/system-validation"
REPORTS_DIR="${PROJECT_ROOT}/reports/system-validation"
VIOLATIONS_LOG="${LOG_DIR}/violations.log"
ARCHIVE_DIR="${PROJECT_ROOT}/archive/misplaced-files"

# Create necessary directories
mkdir -p "$LOG_DIR" "$REPORTS_DIR" "$ARCHIVE_DIR"

# Global variables
VERBOSE=false
FIX_ISSUES=false
VALIDATION_MODE="standard"
LOG_FILE=""

# Counters
VIOLATIONS_FOUND=0
FILES_MOVED=0
FILES_ARCHIVED=0
TESTS_PASSED=0
TESTS_FAILED=0

# Available validation modes
declare -a VALIDATION_MODES=("quick" "standard" "thorough" "audit")

# Project structure rules
declare -A ALLOWED_EXTENSIONS=(
    ["instances"]="cls,trigger,flow,xml,json,md,txt,csv,log"
    ["scripts"]="sh,py,js,sql"
    ["config"]="json,yaml,yml,xml,properties"
    ["docs"]="md,txt,pdf,html"
    ["logs"]="log,txt,json"
    ["reports"]="json,html,csv,pdf"
)

# Function to display usage
usage() {
    cat << 'EOF'
Usage: unified-system-validator.sh [OPTIONS]

Consolidated system validation framework for Salesforce projects.

VALIDATION TYPES:
    -t structure    Validate project structure and file placement
    -t connectivity Test Salesforce connectivity and authentication
    -t permissions  Validate field and object permissions
    -t configuration Validate system configuration integrity
    -t performance  Analyze system performance and optimization
    -t all          Run all validation types (default)

OPTIONAL PARAMETERS:
    -a ALIAS        Salesforce org alias for connectivity tests
    -m MODE         Validation mode: quick, standard, thorough, audit (default: standard)
    -f              Fix issues automatically where possible
    -r              Generate detailed validation report
    -v              Verbose output
    -h              Display this help message

EXAMPLES:
    # Validate project structure
    unified-system-validator.sh -t structure -f

    # Test connectivity to specific org
    unified-system-validator.sh -t connectivity -a myorg

    # Comprehensive system audit
    unified-system-validator.sh -t all -m audit -r

    # Quick health check
    unified-system-validator.sh -t all -m quick

EOF
    exit 1
}

# Logging functions
setup_logging() {
    local validation_type="${1:-system}"
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    LOG_FILE="${LOG_DIR}/${validation_type}_validation_${timestamp}.log"
    
    cat > "$LOG_FILE" << EOF
# Unified System Validator Log
# Type: $validation_type
# Timestamp: $(date)
# PID: $$
# Command: $0 $*
================================================================================

EOF
}

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Console output with colors
    case "$level" in
        ERROR)   echo -e "${RED}[ERROR]${NC} $message" >&2 ;;
        WARNING) echo -e "${YELLOW}[WARNING]${NC} $message" ;;
        INFO)    echo -e "${BLUE}[INFO]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
        DEBUG)   [[ $VERBOSE == true ]] && echo -e "${CYAN}[DEBUG]${NC} $message" ;;
        PROGRESS) echo -e "${MAGENTA}[PROGRESS]${NC} $message" ;;
        RESULT)  echo -e "${GREEN}[RESULT]${NC} $message" ;;
    esac
    
    # File output without colors
    if [[ -n "$LOG_FILE" ]]; then
        echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
        echo "[$timestamp] [$level] $message" >> "$VIOLATIONS_LOG"
    fi
}

# Structure validation functions
validate_project_structure() {
    log PROGRESS "Validating project structure..."
    
    local structure_violations=0
    local structure_fixes=0
    
    # Check required directories
    local required_dirs=("instances" "scripts" "config" "docs" "logs" "reports" "agents" ".claude")
    
    for dir in "${required_dirs[@]}"; do
        local dir_path="$PROJECT_ROOT/$dir"
        if [[ ! -d "$dir_path" ]]; then
            log WARNING "Missing required directory: $dir"
            ((structure_violations++))
            
            if [[ "$FIX_ISSUES" == "true" ]]; then
                log INFO "Creating missing directory: $dir"
                mkdir -p "$dir_path"
                ((structure_fixes++))
            fi
        else
            log DEBUG "Required directory exists: $dir"
        fi
    done
    
    # Check for misplaced files
    log DEBUG "Checking for misplaced files..."
    
    # Check root directory for Salesforce files
    find "$PROJECT_ROOT" -maxdepth 1 -type f \( -name "*.cls" -o -name "*.trigger" -o -name "*.flow" -o -name "*-meta.xml" \) | while read -r file; do
        log WARNING "Misplaced Salesforce file in root: $(basename "$file")"
        ((structure_violations++))
        
        if [[ "$FIX_ISSUES" == "true" ]]; then
            local archive_path="$ARCHIVE_DIR/$(date +%Y%m%d)/$(basename "$file")"
            mkdir -p "$(dirname "$archive_path")"
            mv "$file" "$archive_path"
            log INFO "Archived misplaced file: $(basename "$file") -> $archive_path"
            ((structure_fixes++))
        fi
    done
    
    # Validate instance structure
    if [[ -d "$PROJECT_ROOT/instances" ]]; then
        find "$PROJECT_ROOT/instances" -mindepth 1 -maxdepth 1 -type d | while read -r instance_dir; do
            local instance_name=$(basename "$instance_dir")
            log DEBUG "Validating instance structure: $instance_name"
            
            local required_instance_dirs=("force-app" "config" "scripts")
            for req_dir in "${required_instance_dirs[@]}"; do
                if [[ ! -d "$instance_dir/$req_dir" ]]; then
                    log WARNING "Missing required instance directory: $instance_name/$req_dir"
                    ((structure_violations++))
                    
                    if [[ "$FIX_ISSUES" == "true" ]]; then
                        mkdir -p "$instance_dir/$req_dir"
                        log INFO "Created missing instance directory: $instance_name/$req_dir"
                        ((structure_fixes++))
                    fi
                fi
            done
        done
    fi
    
    # Check file extensions in appropriate directories
    for dir_name in "${!ALLOWED_EXTENSIONS[@]}"; do
        local dir_path="$PROJECT_ROOT/$dir_name"
        if [[ -d "$dir_path" ]]; then
            local allowed_exts="${ALLOWED_EXTENSIONS[$dir_name]}"
            IFS=',' read -ra ext_array <<< "$allowed_exts"
            
            find "$dir_path" -type f | while read -r file; do
                local extension="${file##*.}"
                local allowed=false
                
                for allowed_ext in "${ext_array[@]}"; do
                    if [[ "$extension" == "$allowed_ext" ]]; then
                        allowed=true
                        break
                    fi
                done
                
                if [[ "$allowed" == "false" ]]; then
                    log WARNING "Unexpected file type in $dir_name: $(basename "$file") (.$extension)"
                    ((structure_violations++))
                fi
            done
        fi
    done
    
    VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + structure_violations))
    FILES_MOVED=$((FILES_MOVED + structure_fixes))
    
    if [[ $structure_violations -eq 0 ]]; then
        log SUCCESS "Project structure validation passed"
        return 0
    else
        log WARNING "Project structure validation found $structure_violations issues"
        if [[ $structure_fixes -gt 0 ]]; then
            log SUCCESS "Fixed $structure_fixes structural issues"
        fi
        return 1
    fi
}

# Connectivity validation functions
test_salesforce_connectivity() {
    local org_alias="$1"
    
    log PROGRESS "Testing Salesforce connectivity..."
    
    local connectivity_issues=0
    
    # Check if Salesforce CLI is available
    if ! command -v sf &> /dev/null; then
        log ERROR "Salesforce CLI (sf) not found"
        ((connectivity_issues++))
        return 1
    fi
    
    log DEBUG "Salesforce CLI found: $(sf --version)"
    
    # Test basic authentication
    if [[ -n "$org_alias" ]]; then
        log DEBUG "Testing authentication with org alias: $org_alias"
        
        # Test org display
        if sf org display --target-org "$org_alias" --json > /dev/null 2>&1; then
            log SUCCESS "Successfully authenticated to org: $org_alias"
            
            # Get org info
            local org_info=$(sf org display --target-org "$org_alias" --json)
            local org_type=$(echo "$org_info" | jq -r '.result.connectedStatus // "Unknown"')
            local org_url=$(echo "$org_info" | jq -r '.result.instanceUrl // "Unknown"')
            local username=$(echo "$org_info" | jq -r '.result.username // "Unknown"')
            
            log INFO "Org Type: $org_type"
            log INFO "Instance URL: $org_url" 
            log INFO "Username: $username"
            
            # Test basic query
            if sf data query --query "SELECT Id FROM User LIMIT 1" --target-org "$org_alias" --json > /dev/null 2>&1; then
                log SUCCESS "Basic SOQL query test passed"
            else
                log ERROR "Basic SOQL query test failed"
                ((connectivity_issues++))
            fi
            
            # Test metadata access
            if sf org list metadata-types --target-org "$org_alias" --json > /dev/null 2>&1; then
                log SUCCESS "Metadata API access test passed"
            else
                log ERROR "Metadata API access test failed"
                ((connectivity_issues++))
            fi
            
        else
            log ERROR "Failed to authenticate to org: $org_alias"
            ((connectivity_issues++))
            
            # Provide troubleshooting suggestions
            log INFO "Troubleshooting suggestions:"
            log INFO "1. Run: sf auth:web:login --alias $org_alias"
            log INFO "2. Check if org is accessible"
            log INFO "3. Verify network connectivity"
        fi
    else
        # Test default org
        log DEBUG "Testing default org authentication"
        
        if sf org display --json > /dev/null 2>&1; then
            log SUCCESS "Default org authentication successful"
            
            # Get default org info
            local default_org=$(sf config get target-org --json | jq -r '.result[0].value // "none"')
            if [[ "$default_org" != "none" ]]; then
                log INFO "Default org: $default_org"
            fi
        else
            log WARNING "No default org configured or authentication failed"
            log INFO "Consider setting up authentication with: sf auth:web:login"
        fi
        
        # List available orgs
        local available_orgs=$(sf org list --json | jq -r '.result.nonScratchOrgs[]?.alias // empty' | head -5)
        if [[ -n "$available_orgs" ]]; then
            log INFO "Available orgs:"
            while read -r org; do
                log INFO "  - $org"
            done <<< "$available_orgs"
        fi
    fi
    
    if [[ $connectivity_issues -eq 0 ]]; then
        log SUCCESS "Salesforce connectivity tests passed"
        return 0
    else
        log WARNING "Salesforce connectivity tests found $connectivity_issues issues"
        return 1
    fi
}

# Permission validation functions
validate_field_permissions() {
    local org_alias="$1"
    local object="${2:-Account}"  # Default to Account for testing
    
    log PROGRESS "Validating field permissions for $object..."
    
    local permission_issues=0
    
    if [[ -z "$org_alias" ]]; then
        log WARNING "No org alias provided, skipping field permission validation"
        return 0
    fi
    
    # Test field accessibility
    local query="SELECT QualifiedApiName, IsAccessible, IsCreateable, IsUpdateable FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '$object' LIMIT 10"
    
    local temp_file="${LOG_DIR}/field_perms_$$.json"
    
    if sf data query --query "$query" --target-org "$org_alias" --json > "$temp_file" 2>&1; then
        local field_count=$(jq -r '.result.records | length' "$temp_file" 2>/dev/null || echo "0")
        
        if [[ "$field_count" -gt 0 ]]; then
            log INFO "Found $field_count accessible fields on $object"
            
            # Check for common accessibility issues
            jq -r '.result.records[] | select(.IsAccessible == false) | .QualifiedApiName' "$temp_file" 2>/dev/null | while read -r field_name; do
                if [[ -n "$field_name" ]]; then
                    log WARNING "Field not accessible: $object.$field_name"
                    ((permission_issues++))
                fi
            done
            
            # Check for read-only fields
            local readonly_fields=$(jq -r '.result.records[] | select(.IsAccessible == true and .IsUpdateable == false) | .QualifiedApiName' "$temp_file" 2>/dev/null | wc -l)
            log INFO "$readonly_fields read-only fields found on $object"
            
        else
            log WARNING "No fields found for $object or insufficient permissions"
            ((permission_issues++))
        fi
    else
        log ERROR "Failed to query field permissions for $object"
        ((permission_issues++))
    fi
    
    rm -f "$temp_file"
    
    if [[ $permission_issues -eq 0 ]]; then
        log SUCCESS "Field permissions validation passed"
        return 0
    else
        log WARNING "Field permissions validation found $permission_issues issues"
        return 1
    fi
}

# Configuration validation functions
validate_system_configuration() {
    log PROGRESS "Validating system configuration..."
    
    local config_issues=0
    
    # Check MCP configuration
    local mcp_config="$PROJECT_ROOT/.mcp.json"
    if [[ -f "$mcp_config" ]]; then
        log DEBUG "Validating MCP configuration..."
        
        if jq empty "$mcp_config" 2>/dev/null; then
            log SUCCESS "MCP configuration is valid JSON"
            
            # Check for required MCP servers
            local sf_server=$(jq -r '.mcpServers["salesforce-dx"] // empty' "$mcp_config")
            if [[ -n "$sf_server" ]]; then
                log SUCCESS "Salesforce MCP server configured"
            else
                log WARNING "Salesforce MCP server not configured in .mcp.json"
                ((config_issues++))
            fi
        else
            log ERROR "MCP configuration contains invalid JSON"
            ((config_issues++))
        fi
    else
        log WARNING "MCP configuration file not found: .mcp.json"
        ((config_issues++))
    fi
    
    # Check Claude configuration
    local claude_dir="$PROJECT_ROOT/.claude"
    if [[ -d "$claude_dir" ]]; then
        log DEBUG "Validating Claude configuration..."
        
        local settings_file="$claude_dir/settings.local.json"
        if [[ -f "$settings_file" ]]; then
            if jq empty "$settings_file" 2>/dev/null; then
                log SUCCESS "Claude settings configuration is valid"
            else
                log ERROR "Claude settings contains invalid JSON"
                ((config_issues++))
            fi
        else
            log INFO "Claude settings file not found (optional)"
        fi
        
        # Check agents directory
        local agents_dir="$claude_dir/agents"
        if [[ -d "$agents_dir" ]]; then
            local agent_count=$(find "$agents_dir" -name "*.md" | wc -l)
            log INFO "Found $agent_count Claude agents configured"
        else
            log WARNING "Claude agents directory not found"
            ((config_issues++))
        fi
    else
        log WARNING "Claude configuration directory not found: .claude"
        ((config_issues++))
    fi
    
    # Check instance configurations
    local instances_dir="$PROJECT_ROOT/instances"
    if [[ -d "$instances_dir" ]]; then
        local instances_config="$instances_dir/config.json"
        if [[ -f "$instances_config" ]]; then
            if jq empty "$instances_config" 2>/dev/null; then
                log SUCCESS "Instances configuration is valid JSON"
                local instance_count=$(jq -r '. | length' "$instances_config")
                log INFO "Found $instance_count instance configurations"
            else
                log ERROR "Instances configuration contains invalid JSON"
                ((config_issues++))
            fi
        else
            log WARNING "Instances configuration file not found"
            ((config_issues++))
        fi
    fi
    
    # Check environment variables
    log DEBUG "Checking environment variables..."
    local env_vars=("SF_TARGET_ORG" "SF_TARGET_ORG")
    for var in "${env_vars[@]}"; do
        if [[ -n "${!var}" ]]; then
            log DEBUG "Environment variable set: $var"
        else
            log INFO "Optional environment variable not set: $var"
        fi
    done
    
    if [[ $config_issues -eq 0 ]]; then
        log SUCCESS "System configuration validation passed"
        return 0
    else
        log WARNING "System configuration validation found $config_issues issues"
        return 1
    fi
}

# Performance validation functions
analyze_system_performance() {
    log PROGRESS "Analyzing system performance..."
    
    local performance_issues=0
    
    # Check disk space
    local disk_usage=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    log INFO "Disk usage: ${disk_usage}%"
    
    if [[ $disk_usage -gt 90 ]]; then
        log ERROR "Critical disk space: ${disk_usage}% used"
        ((performance_issues++))
    elif [[ $disk_usage -gt 80 ]]; then
        log WARNING "High disk usage: ${disk_usage}% used"
        ((performance_issues++))
    fi
    
    # Check log file sizes
    if [[ -d "$LOG_DIR" ]]; then
        local large_logs=$(find "$LOG_DIR" -name "*.log" -size +10M | wc -l)
        if [[ $large_logs -gt 0 ]]; then
            log WARNING "Found $large_logs large log files (>10MB)"
            log INFO "Consider archiving old log files"
            ((performance_issues++))
        fi
    fi
    
    # Check temporary files
    local temp_dirs=(".import-work" ".validation-cache" "temp")
    for temp_dir in "${temp_dirs[@]}"; do
        local temp_path="$PROJECT_ROOT/$temp_dir"
        if [[ -d "$temp_path" ]]; then
            local temp_size=$(du -sh "$temp_path" 2>/dev/null | cut -f1)
            log INFO "Temporary directory $temp_dir: $temp_size"
            
            # Check for old temporary files
            local old_files=$(find "$temp_path" -type f -mtime +7 | wc -l)
            if [[ $old_files -gt 0 ]]; then
                log WARNING "Found $old_files temporary files older than 7 days in $temp_dir"
                log INFO "Consider cleaning up old temporary files"
                ((performance_issues++))
            fi
        fi
    done
    
    # Check script execution permissions
    local script_issues=0
    find "$PROJECT_ROOT/scripts" -name "*.sh" -type f | while read -r script; do
        if [[ ! -x "$script" ]]; then
            log WARNING "Script not executable: $(basename "$script")"
            ((script_issues++))
        fi
    done
    
    if [[ $script_issues -gt 0 ]]; then
        log WARNING "Found $script_issues non-executable scripts"
        if [[ "$FIX_ISSUES" == "true" ]]; then
            find "$PROJECT_ROOT/scripts" -name "*.sh" -type f -exec chmod +x {} \;
            log SUCCESS "Made all shell scripts executable"
        fi
        ((performance_issues++))
    fi
    
    if [[ $performance_issues -eq 0 ]]; then
        log SUCCESS "System performance analysis passed"
        return 0
    else
        log WARNING "System performance analysis found $performance_issues issues"
        return 1
    fi
}

# Health check summary
generate_health_report() {
    local report_file="$1"
    
    log INFO "Generating system health report..."
    
    cat > "$report_file" << EOF
# System Health Report
Generated: $(date)
Project Root: $PROJECT_ROOT

## Summary
- Total Violations Found: $VIOLATIONS_FOUND
- Files Moved/Fixed: $FILES_MOVED
- Tests Passed: $TESTS_PASSED
- Tests Failed: $TESTS_FAILED

## System Status
EOF
    
    # Add status indicators
    if [[ $VIOLATIONS_FOUND -eq 0 ]] && [[ $TESTS_FAILED -eq 0 ]]; then
        echo "✅ System Health: HEALTHY" >> "$report_file"
    elif [[ $VIOLATIONS_FOUND -lt 5 ]] && [[ $TESTS_FAILED -lt 3 ]]; then
        echo "⚠️ System Health: NEEDS ATTENTION" >> "$report_file"
    else
        echo "❌ System Health: CRITICAL ISSUES" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

## Recommendations
EOF
    
    if [[ $VIOLATIONS_FOUND -gt 0 ]]; then
        echo "- Address structural violations identified in validation" >> "$report_file"
    fi
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo "- Fix failed connectivity or permission tests" >> "$report_file"
    fi
    
    if [[ $FILES_MOVED -gt 0 ]]; then
        echo "- Review files that were moved or archived" >> "$report_file"
    fi
    
    echo "- Review detailed log file: $LOG_FILE" >> "$report_file"
    
    log SUCCESS "Health report generated: $report_file"
}

# Main execution function
main() {
    # Initialize variables
    local validation_type="all"
    local org_alias=""
    local generate_report=false
    
    # Parse command line arguments
    while getopts "t:a:m:frvh" opt; do
        case $opt in
            t) validation_type="$OPTARG";;
            a) org_alias="$OPTARG";;
            m) VALIDATION_MODE="$OPTARG";;
            f) FIX_ISSUES=true;;
            r) generate_report=true;;
            v) VERBOSE=true;;
            h) usage;;
            *) usage;;
        esac
    done
    
    # Validate validation mode
    if [[ ! " ${VALIDATION_MODES[@]} " =~ " $VALIDATION_MODE " ]]; then
        log ERROR "Invalid validation mode: $VALIDATION_MODE. Must be one of: ${VALIDATION_MODES[*]}"
        exit 1
    fi
    
    # Setup logging
    setup_logging "$validation_type"
    
    # Display configuration
    echo -e "${GREEN}=== Unified System Validator ===${NC}"
    echo -e "${BLUE}Validation Type:${NC} $validation_type"
    echo -e "${BLUE}Mode:${NC} $VALIDATION_MODE"
    [[ -n "$org_alias" ]] && echo -e "${BLUE}Org Alias:${NC} $org_alias"
    [[ "$FIX_ISSUES" == "true" ]] && echo -e "${BLUE}Auto-fix:${NC} Enabled"
    echo ""
    
    # Execute validation based on type
    local overall_success=true
    
    case "$validation_type" in
        structure)
            if validate_project_structure; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            ;;
            
        connectivity)
            if test_salesforce_connectivity "$org_alias"; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            ;;
            
        permissions)
            if validate_field_permissions "$org_alias"; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            ;;
            
        configuration)
            if validate_system_configuration; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            ;;
            
        performance)
            if analyze_system_performance; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            ;;
            
        all)
            log INFO "Running comprehensive system validation..."
            
            # Run all validations
            if validate_project_structure; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            
            if test_salesforce_connectivity "$org_alias"; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            
            if validate_field_permissions "$org_alias"; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            
            if validate_system_configuration; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            
            if analyze_system_performance; then
                ((TESTS_PASSED++))
            else
                ((TESTS_FAILED++))
                overall_success=false
            fi
            ;;
            
        *)
            log ERROR "Unknown validation type: $validation_type"
            exit 1
            ;;
    esac
    
    # Generate report if requested
    if [[ "$generate_report" == "true" ]]; then
        local report_file="${REPORTS_DIR}/system_health_report_$(date +%Y%m%d_%H%M%S).md"
        generate_health_report "$report_file"
    fi
    
    # Final summary
    echo ""
    log RESULT "Validation Summary:"
    log RESULT "  Tests Passed: $TESTS_PASSED"
    log RESULT "  Tests Failed: $TESTS_FAILED"
    log RESULT "  Violations Found: $VIOLATIONS_FOUND"
    log RESULT "  Issues Fixed: $FILES_MOVED"
    
    if [[ "$overall_success" == "true" ]]; then
        log SUCCESS "All system validations passed!"
        log INFO "Log file: $LOG_FILE"
        exit 0
    else
        log ERROR "Some system validations failed. Check log file for details: $LOG_FILE"
        exit 1
    fi
}

# Execute main function
main "$@"