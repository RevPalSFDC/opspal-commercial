#!/bin/bash

# Comprehensive Pre-Flight Check System for Salesforce Operations
# Runs all validators before bulk operations to prevent errors

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORTS_DIR="$PROJECT_ROOT/reports/preflight"
LOG_FILE="$PROJECT_ROOT/logs/preflight-check.log"

# Include other validators
FIELD_VERIFIER="$SCRIPT_DIR/field-verifier.sh"
PICKLIST_VALIDATOR="$SCRIPT_DIR/picklist-validator.sh"
CSV_SANITIZER="$SCRIPT_DIR/csv-sanitizer.sh"
VALIDATION_ANALYZER="$SCRIPT_DIR/validation-rule-analyzer.sh"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$REPORTS_DIR" "$(dirname "$LOG_FILE")"

# Load environment
source "$PROJECT_ROOT/.env" 2>/dev/null || true

# Check results storage
declare -A CHECK_RESULTS
declare -A CHECK_MESSAGES
TOTAL_CHECKS=0
PASSED_CHECKS=0
WARNING_CHECKS=0
FAILED_CHECKS=0

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Function to run a check and store result
run_check() {
    local check_name="$1"
    local check_command="$2"
    local severity="${3:-error}"  # error, warning, info
    
    echo -e "${BLUE}Running: $check_name...${NC}"
    ((TOTAL_CHECKS++))
    
    local output=$(eval "$check_command" 2>&1)
    local status=$?
    
    if [ $status -eq 0 ]; then
        CHECK_RESULTS["$check_name"]="PASS"
        CHECK_MESSAGES["$check_name"]="Check passed"
        ((PASSED_CHECKS++))
        echo -e "${GREEN}  ✓ PASS${NC}"
    elif [ "$severity" = "warning" ]; then
        CHECK_RESULTS["$check_name"]="WARNING"
        CHECK_MESSAGES["$check_name"]="$output"
        ((WARNING_CHECKS++))
        echo -e "${YELLOW}  ⚠ WARNING${NC}"
    else
        CHECK_RESULTS["$check_name"]="FAIL"
        CHECK_MESSAGES["$check_name"]="$output"
        ((FAILED_CHECKS++))
        echo -e "${RED}  ✗ FAIL${NC}"
    fi
    
    log_message "Check '$check_name': ${CHECK_RESULTS[$check_name]}"
}

# Function to check CSV file
check_csv_file() {
    local csv_file="$1"
    
    echo -e "\n${CYAN}═══ CSV File Checks ═══${NC}"
    
    # Check file exists
    if [ ! -f "$csv_file" ]; then
        CHECK_RESULTS["File Exists"]="FAIL"
        CHECK_MESSAGES["File Exists"]="File not found: $csv_file"
        ((FAILED_CHECKS++))
        return 1
    else
        CHECK_RESULTS["File Exists"]="PASS"
        ((PASSED_CHECKS++))
    fi
    
    # Check file size
    local file_size=$(stat -c%s "$csv_file" 2>/dev/null || stat -f%z "$csv_file" 2>/dev/null)
    if [ "$file_size" -gt 10485760 ]; then  # 10MB limit for bulk API
        run_check "File Size" "echo 'File too large: $(du -h $csv_file | cut -f1)'" "warning"
    else
        run_check "File Size" "echo 'OK'" "info"
    fi
    
    # Check line endings
    run_check "Line Endings" "$CSV_SANITIZER check '$csv_file' | grep -q 'LF (Unix)'"
    
    # Check encoding
    run_check "File Encoding" "file -bi '$csv_file' | grep -q 'utf-8\|ascii'"
    
    # Check CSV structure
    run_check "CSV Structure" "$CSV_SANITIZER validate '$csv_file'"
    
    return 0
}

# Function to check field mappings
check_field_mappings() {
    local csv_file="$1"
    local object_name="$2"
    
    echo -e "\n${CYAN}═══ Field Mapping Checks ═══${NC}"
    
    # Get CSV headers
    local headers=$(head -1 "$csv_file" | tr ',' '\n' | tr -d '"' | tr -d '\r')
    
    # Validate each field
    local field_errors=0
    while IFS= read -r field; do
        [ -z "$field" ] && continue
        
        # Skip standard fields
        if [[ "$field" == "Id" ]] || [[ "$field" == "Name" ]]; then
            continue
        fi
        
        # Check if field exists
        if ! $FIELD_VERIFIER verify "$object_name" "$field" >/dev/null 2>&1; then
            echo -e "${YELLOW}  ⚠ Unknown field: $field${NC}"
            ((field_errors++))
        fi
    done <<< "$headers"
    
    if [ $field_errors -eq 0 ]; then
        run_check "Field Mappings" "echo 'All fields valid'"
    else
        run_check "Field Mappings" "echo '$field_errors invalid fields'" "warning"
    fi
}

# Function to check picklist values
check_picklist_values() {
    local csv_file="$1"
    local object_name="$2"
    local picklist_fields="$3"
    
    echo -e "\n${CYAN}═══ Picklist Value Checks ═══${NC}"
    
    if [ -z "$picklist_fields" ]; then
        echo "  No picklist fields specified, skipping..."
        return 0
    fi
    
    # Check each picklist field
    IFS=',' read -ra fields <<< "$picklist_fields"
    for field in "${fields[@]}"; do
        field=$(echo "$field" | xargs)  # Trim whitespace
        
        # Get column number for field
        local col_num=$(head -1 "$csv_file" | tr ',' '\n' | grep -n "^\"*$field\"*$" | cut -d: -f1)
        
        if [ -n "$col_num" ]; then
            run_check "Picklist: $field" "$PICKLIST_VALIDATOR csv '$csv_file' '$object_name' '$field' '' '$col_num'"
        else
            echo -e "${YELLOW}  ⚠ Field $field not found in CSV${NC}"
        fi
    done
}

# Function to check validation rules
check_validation_rules() {
    local object_name="$1"
    
    echo -e "\n${CYAN}═══ Validation Rule Checks ═══${NC}"
    
    # Fetch and analyze validation rules
    run_check "Validation Rules" "$VALIDATION_ANALYZER analyze '$object_name' | grep -q 'Active: 0'" "warning"
    
    # Check if safe defaults exist
    local defaults_file="$PROJECT_ROOT/config/safe_defaults_${object_name}.json"
    if [ -f "$defaults_file" ]; then
        echo -e "${GREEN}  ✓ Safe defaults available${NC}"
    else
        echo -e "${YELLOW}  ⚠ No safe defaults configured${NC}"
        echo "    Run: $VALIDATION_ANALYZER defaults $object_name"
    fi
}

# Function to check org limits
check_org_limits() {
    echo -e "\n${CYAN}═══ Org Limit Checks ═══${NC}"
    
    # Check storage limits
    local limits=$(sf limits api display --json 2>/dev/null | jq '.result')
    
    if [ -n "$limits" ]; then
        local data_storage=$(echo "$limits" | jq -r '.[] | select(.name == "DataStorageMB") | .remaining')
        local file_storage=$(echo "$limits" | jq -r '.[] | select(.name == "FileStorageMB") | .remaining')
        local api_requests=$(echo "$limits" | jq -r '.[] | select(.name == "DailyApiRequests") | .remaining')
        
        if [ "$data_storage" -lt 100 ]; then
            run_check "Data Storage" "echo 'Low storage: ${data_storage}MB remaining'" "warning"
        else
            run_check "Data Storage" "echo 'OK: ${data_storage}MB available'"
        fi
        
        if [ "$api_requests" -lt 1000 ]; then
            run_check "API Limits" "echo 'Low API calls: $api_requests remaining'" "warning"
        else
            run_check "API Limits" "echo 'OK: $api_requests available'"
        fi
    else
        echo -e "${YELLOW}  ⚠ Could not fetch org limits${NC}"
    fi
}

# Function to check user permissions
check_permissions() {
    local object_name="$1"
    local operation="${2:-create}"
    
    echo -e "\n${CYAN}═══ Permission Checks ═══${NC}"
    
    # Check object permissions
    local perms=$(sf sobject describe --sobject "$object_name" --json 2>/dev/null | \
                  jq -r '.result | "Create: \(.createable), Update: \(.updateable), Delete: \(.deleteable)"')
    
    if [ -n "$perms" ]; then
        echo "  $perms"
        
        case "$operation" in
            create)
                run_check "Create Permission" "echo '$perms' | grep -q 'Create: true'"
                ;;
            update)
                run_check "Update Permission" "echo '$perms' | grep -q 'Update: true'"
                ;;
            delete)
                run_check "Delete Permission" "echo '$perms' | grep -q 'Delete: true'"
                ;;
        esac
    else
        run_check "Object Permissions" "echo 'Could not verify permissions'" "warning"
    fi
}

# Function to estimate success rate
estimate_success_rate() {
    echo -e "\n${CYAN}═══ Success Rate Estimation ═══${NC}"
    
    local success_probability=100
    
    # Adjust based on check results
    if [ $FAILED_CHECKS -gt 0 ]; then
        success_probability=$((success_probability - (FAILED_CHECKS * 20)))
    fi
    
    if [ $WARNING_CHECKS -gt 0 ]; then
        success_probability=$((success_probability - (WARNING_CHECKS * 5)))
    fi
    
    # Ensure minimum 0
    [ $success_probability -lt 0 ] && success_probability=0
    
    # Display estimation
    if [ $success_probability -ge 80 ]; then
        echo -e "${GREEN}  Estimated Success Rate: ${success_probability}%${NC}"
        echo "  Recommendation: Safe to proceed"
    elif [ $success_probability -ge 50 ]; then
        echo -e "${YELLOW}  Estimated Success Rate: ${success_probability}%${NC}"
        echo "  Recommendation: Review warnings before proceeding"
    else
        echo -e "${RED}  Estimated Success Rate: ${success_probability}%${NC}"
        echo "  Recommendation: Fix critical issues before proceeding"
    fi
    
    return $success_probability
}

# Function to generate HTML report
generate_html_report() {
    local report_file="$REPORTS_DIR/preflight_$(date +%Y%m%d_%H%M%S).html"
    
    cat > "$report_file" << 'HTML'
<!DOCTYPE html>
<html>
<head>
    <title>Pre-Flight Check Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #2196F3; color: white; padding: 20px; border-radius: 5px; }
        .summary { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .check-section { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .pass { color: #4CAF50; font-weight: bold; }
        .fail { color: #f44336; font-weight: bold; }
        .warning { color: #FF9800; font-weight: bold; }
        .check-item { padding: 10px; margin: 5px 0; border-left: 4px solid #ddd; background: #fafafa; }
        .check-item.pass { border-color: #4CAF50; }
        .check-item.fail { border-color: #f44336; }
        .check-item.warning { border-color: #FF9800; }
        .stats { display: flex; justify-content: space-around; }
        .stat-box { text-align: center; padding: 15px; }
        .stat-number { font-size: 2em; font-weight: bold; }
        .recommendations { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Pre-Flight Check Report</h1>
        <p>Generated: TIMESTAMP</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <div class="stats">
            <div class="stat-box">
                <div class="stat-number">TOTAL_CHECKS</div>
                <div>Total Checks</div>
            </div>
            <div class="stat-box">
                <div class="stat-number pass">PASSED_CHECKS</div>
                <div>Passed</div>
            </div>
            <div class="stat-box">
                <div class="stat-number warning">WARNING_CHECKS</div>
                <div>Warnings</div>
            </div>
            <div class="stat-box">
                <div class="stat-number fail">FAILED_CHECKS</div>
                <div>Failed</div>
            </div>
        </div>
    </div>
    
    <div class="check-section">
        <h2>Check Results</h2>
        CHECK_RESULTS_HTML
    </div>
    
    <div class="recommendations">
        <h3>Recommendations</h3>
        RECOMMENDATIONS_HTML
    </div>
</body>
</html>
HTML
    
    # Generate check results HTML
    local check_results_html=""
    for check_name in "${!CHECK_RESULTS[@]}"; do
        local status="${CHECK_RESULTS[$check_name]}"
        local message="${CHECK_MESSAGES[$check_name]}"
        local css_class=$(echo "$status" | tr '[:upper:]' '[:lower:]')
        
        check_results_html+="<div class='check-item $css_class'>"
        check_results_html+="<strong>$check_name:</strong> "
        check_results_html+="<span class='$css_class'>$status</span>"
        if [ "$status" != "PASS" ]; then
            check_results_html+="<br><small>$message</small>"
        fi
        check_results_html+="</div>"
    done
    
    # Generate recommendations
    local recommendations=""
    if [ $FAILED_CHECKS -gt 0 ]; then
        recommendations+="<li><strong>Critical:</strong> Fix all failed checks before proceeding</li>"
    fi
    if [ $WARNING_CHECKS -gt 0 ]; then
        recommendations+="<li><strong>Warning:</strong> Review and address warnings to improve success rate</li>"
    fi
    if [ $FAILED_CHECKS -eq 0 ] && [ $WARNING_CHECKS -eq 0 ]; then
        recommendations+="<li><strong>Ready:</strong> All checks passed, safe to proceed with operation</li>"
    fi
    
    # Replace placeholders
    sed -i "s|TIMESTAMP|$(date)|g" "$report_file"
    sed -i "s|TOTAL_CHECKS|$TOTAL_CHECKS|g" "$report_file"
    sed -i "s|PASSED_CHECKS|$PASSED_CHECKS|g" "$report_file"
    sed -i "s|WARNING_CHECKS|$WARNING_CHECKS|g" "$report_file"
    sed -i "s|FAILED_CHECKS|$FAILED_CHECKS|g" "$report_file"
    sed -i "s|CHECK_RESULTS_HTML|$check_results_html|g" "$report_file"
    sed -i "s|RECOMMENDATIONS_HTML|<ul>$recommendations</ul>|g" "$report_file"
    
    echo -e "\n${GREEN}✓ HTML report generated: $report_file${NC}"
}

# Main pre-flight check function
run_preflight_check() {
    local csv_file="$1"
    local object_name="$2"
    local operation="${3:-create}"
    local picklist_fields="${4:-}"
    
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     PRE-FLIGHT CHECK SYSTEM           ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "CSV File: $csv_file"
    echo "Object: $object_name"
    echo "Operation: $operation"
    echo "Timestamp: $(date)"
    echo ""
    
    log_message "Starting pre-flight check for $object_name ($operation)"
    
    # Reset counters
    TOTAL_CHECKS=0
    PASSED_CHECKS=0
    WARNING_CHECKS=0
    FAILED_CHECKS=0
    
    # Run all checks
    check_csv_file "$csv_file"
    check_field_mappings "$csv_file" "$object_name"
    
    if [ -n "$picklist_fields" ]; then
        check_picklist_values "$csv_file" "$object_name" "$picklist_fields"
    fi
    
    check_validation_rules "$object_name"
    check_permissions "$object_name" "$operation"
    check_org_limits
    
    # Generate summary
    echo -e "\n${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           CHECK SUMMARY                ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "Total Checks: $TOTAL_CHECKS"
    echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
    echo -e "${YELLOW}Warnings: $WARNING_CHECKS${NC}"
    echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
    
    # Estimate success
    estimate_success_rate
    local success_rate=$?
    
    # Generate report
    generate_html_report
    
    # Return status
    if [ $FAILED_CHECKS -gt 0 ]; then
        return 1
    elif [ $WARNING_CHECKS -gt 0 ]; then
        return 2
    else
        return 0
    fi
}

# Quick check mode
quick_check() {
    local csv_file="$1"
    local object_name="$2"
    
    echo -e "${CYAN}Running quick pre-flight check...${NC}"
    
    # Just check critical items
    check_csv_file "$csv_file"
    check_permissions "$object_name" "create"
    
    if [ $FAILED_CHECKS -gt 0 ]; then
        echo -e "${RED}✗ Quick check failed${NC}"
        return 1
    else
        echo -e "${GREEN}✓ Quick check passed${NC}"
        return 0
    fi
}

# Main menu
show_menu() {
    echo -e "\n${BLUE}═══ Pre-Flight Check System ═══${NC}"
    echo "1) Run full pre-flight check"
    echo "2) Quick check (critical only)"
    echo "3) Check CSV file only"
    echo "4) Check permissions only"
    echo "5) Check validation rules only"
    echo "6) View last report"
    echo "7) Exit"
    echo -n "Select option: "
}

# Interactive mode
interactive_mode() {
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                echo -n "CSV file: "
                read -r csv
                echo -n "Object name: "
                read -r object
                echo -n "Operation (create/update/delete): "
                read -r op
                echo -n "Picklist fields (comma-separated, optional): "
                read -r picklists
                run_preflight_check "$csv" "$object" "$op" "$picklists"
                ;;
            2)
                echo -n "CSV file: "
                read -r csv
                echo -n "Object name: "
                read -r object
                quick_check "$csv" "$object"
                ;;
            3)
                echo -n "CSV file: "
                read -r csv
                check_csv_file "$csv"
                ;;
            4)
                echo -n "Object name: "
                read -r object
                echo -n "Operation: "
                read -r op
                check_permissions "$object" "$op"
                ;;
            5)
                echo -n "Object name: "
                read -r object
                check_validation_rules "$object"
                ;;
            6)
                latest=$(ls -t "$REPORTS_DIR"/preflight_*.html 2>/dev/null | head -1)
                if [ -n "$latest" ]; then
                    echo "Opening: $latest"
                    wslview "$latest" 2>/dev/null || open "$latest" 2>/dev/null || xdg-open "$latest" 2>/dev/null || echo "Please open manually: $latest"
                else
                    echo "No reports found"
                fi
                ;;
            7)
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac
    done
}

# Command line mode
if [ $# -eq 0 ]; then
    interactive_mode
else
    case "$1" in
        check)
            run_preflight_check "$2" "$3" "${4:-create}" "${5:-}"
            ;;
        quick)
            quick_check "$2" "$3"
            ;;
        csv)
            check_csv_file "$2"
            ;;
        permissions)
            check_permissions "$2" "${3:-create}"
            ;;
        validation)
            check_validation_rules "$2"
            ;;
        *)
            echo "Usage: $0 {check|quick|csv|permissions|validation} [options]"
            echo ""
            echo "Commands:"
            echo "  check <csv> <obj> [op] [fields] - Full pre-flight check"
            echo "  quick <csv> <object>            - Quick check"
            echo "  csv <file>                      - Check CSV file"
            echo "  permissions <object> [op]       - Check permissions"
            echo "  validation <object>             - Check validation rules"
            exit 1
            ;;
    esac
fi