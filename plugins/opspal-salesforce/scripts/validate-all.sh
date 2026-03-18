#!/bin/bash

##############################################################################
# validate-all.sh - Unified Validation Suite for Salesforce Data
##############################################################################
# Runs all validation checks in sequence to ensure data is import-ready
##############################################################################

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source validation commons
source "${SCRIPT_DIR}/lib/validation-commons.sh"

# Validators to run
VALIDATORS=(
    "validate-picklists.sh:Picklist Restrictions"
    "validate-lookups.sh:Lookup Relationships"
    "validate-required.sh:Required Fields"
    "validate-duplicates.sh:Duplicate Prevention"
)

# Default configuration
DEFAULT_ORG="${SF_TARGET_ORG}"
VALIDATION_MODE="standard"  # quick, standard, thorough
STOP_ON_ERROR=false
GENERATE_REPORT=true
AUTO_FIX=false

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] <csv-file> <object-name>

Comprehensive validation suite that runs all data quality checks before import.

Arguments:
    csv-file        Path to CSV file to validate
    object-name     Salesforce object API name (e.g., Account, Opportunity)

Options:
    -o, --org       Salesforce org alias (default: $DEFAULT_ORG)
    -m, --mode      Validation mode:
                    quick    - Essential checks only (picklist, required)
                    standard - All validators (default)
                    thorough - All validators with strict settings
    -s, --stop      Stop on first validation failure
    -f, --fix       Attempt auto-fix for all issues
    -r, --report    Generate unified HTML report
    -v, --verbose   Show detailed progress
    -h, --help      Display this help message

Examples:
    # Basic validation
    $0 accounts.csv Account

    # Quick validation with auto-fix
    $0 -m quick -f opportunities.csv Opportunity

    # Thorough validation for production import
    $0 -m thorough -o production leads.csv Lead

    # Stop on first error
    $0 -s contacts.csv Contact

Validation Sequence:
    1. Picklist Restrictions - Validates record type constraints
    2. Lookup Relationships - Checks all references exist
    3. Required Fields - Ensures mandatory fields are populated
    4. Duplicate Prevention - Detects duplicate records

Output:
    Creates a validation directory with:
    - Individual validator results
    - Combined clean data file
    - Unified validation report
    - Risk assessment score

EOF
    exit 0
}

# Parse command line arguments
ORG="$DEFAULT_ORG"
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--org)
            ORG="$2"
            shift 2
            ;;
        -m|--mode)
            VALIDATION_MODE="$2"
            shift 2
            ;;
        -s|--stop)
            STOP_ON_ERROR=true
            shift
            ;;
        -f|--fix)
            AUTO_FIX=true
            shift
            ;;
        -r|--report)
            GENERATE_REPORT=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            ;;
        *)
            break
            ;;
    esac
done

# Check required arguments
if [[ $# -lt 2 ]]; then
    log_error "Missing required arguments"
    usage
fi

CSV_FILE="$1"
OBJECT_NAME="$2"

# Validate inputs
if [[ ! -f "$CSV_FILE" ]]; then
    log_error "CSV file not found: $CSV_FILE"
    exit 1
fi

# Create validation directory
VALIDATION_DIR="$(dirname "$CSV_FILE")/validation_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$VALIDATION_DIR"

# Copy original file to validation directory
cp "$CSV_FILE" "$VALIDATION_DIR/original.csv"
WORKING_FILE="$VALIDATION_DIR/original.csv"

# Function to run individual validator
run_validator() {
    local validator_script="$1"
    local validator_name="$2"
    local input_file="$3"
    local step_num="$4"
    local total_steps="$5"
    
    echo
    echo "════════════════════════════════════════════════════════════════"
    echo " Step $step_num/$total_steps: $validator_name"
    echo "════════════════════════════════════════════════════════════════"
    echo
    
    local validator_path="${SCRIPT_DIR}/${validator_script%:*}"
    
    if [[ ! -f "$validator_path" ]]; then
        log_warning "Validator not found: $validator_path"
        return 1
    fi
    
    # Build validator command
    local cmd="$validator_path"
    cmd="$cmd -o $ORG"
    
    [[ "$AUTO_FIX" == true ]] && {
        case "$validator_script" in
            *picklist*) ;;  # Picklist validator doesn't have -x flag
            *lookups*) cmd="$cmd -x" ;;
            *required*) cmd="$cmd -d" ;;
            *duplicates*) cmd="$cmd -s first" ;;
        esac
    }
    
    [[ "$VERBOSE" == true ]] && cmd="$cmd -v"
    
    cmd="$cmd $input_file $OBJECT_NAME"
    
    # Run validator
    local start_time=$(date +%s)
    local exit_code=0
    
    if $cmd > "$VALIDATION_DIR/${validator_script%:*}.log" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "$validator_name passed (${duration}s)"
        
        # Use clean/valid output for next validator
        local base_name=$(basename "$input_file" .csv)
        local next_file=""
        
        case "$validator_script" in
            *picklist*)
                [[ -f "${VALIDATION_DIR}/${base_name}-clean.csv" ]] && \
                    next_file="${VALIDATION_DIR}/${base_name}-clean.csv"
                ;;
            *lookups*)
                [[ -f "${VALIDATION_DIR}/${base_name}-valid.csv" ]] && \
                    next_file="${VALIDATION_DIR}/${base_name}-valid.csv"
                ;;
            *required*)
                if [[ "$AUTO_FIX" == true ]] && [[ -f "${VALIDATION_DIR}/${base_name}-fixed.csv" ]]; then
                    next_file="${VALIDATION_DIR}/${base_name}-fixed.csv"
                elif [[ -f "${VALIDATION_DIR}/${base_name}-complete.csv" ]]; then
                    next_file="${VALIDATION_DIR}/${base_name}-complete.csv"
                fi
                ;;
            *duplicates*)
                [[ -f "${VALIDATION_DIR}/${base_name}-unique.csv" ]] && \
                    next_file="${VALIDATION_DIR}/${base_name}-unique.csv"
                ;;
        esac
        
        [[ -n "$next_file" ]] && echo "$next_file"
    else
        exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_error "$validator_name failed (${duration}s)"
        
        if [[ "$STOP_ON_ERROR" == true ]]; then
            log_error "Stopping validation due to error"
            return $exit_code
        fi
    fi
    
    return 0
}

# Function to generate unified report
generate_unified_report() {
    local report_file="$VALIDATION_DIR/validation_report.html"
    
    log_info "Generating unified validation report..."
    
    cat > "$report_file" <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Salesforce Data Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #0070d2; color: white; padding: 20px; border-radius: 5px; }
        .summary { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .validator { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .pass { border-left: 5px solid #04844b; }
        .fail { border-left: 5px solid #c23934; }
        .warning { border-left: 5px solid #ff9a3c; }
        .metric { display: inline-block; margin: 10px 20px; }
        .metric-value { font-size: 24px; font-weight: bold; }
        .metric-label { color: #666; font-size: 12px; }
        .risk-score { 
            font-size: 48px; 
            font-weight: bold; 
            padding: 20px;
            border-radius: 50%;
            width: 100px;
            height: 100px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 20px auto;
        }
        .risk-low { background: #d4f4dd; color: #04844b; }
        .risk-medium { background: #fff5e6; color: #ff9a3c; }
        .risk-high { background: #fce4e4; color: #c23934; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th { background: #f0f0f0; padding: 10px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #eee; }
        .files { background: #f9f9f9; padding: 10px; border-radius: 3px; margin: 10px 0; }
        code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Salesforce Data Validation Report</h1>
        <p>Generated: $(date)</p>
        <p>Object: $OBJECT_NAME | Org: $ORG</p>
    </div>
EOF
    
    # Calculate risk score
    local total_issues=0
    local critical_issues=0
    
    # Parse individual reports
    for report in "$VALIDATION_DIR"/*-report.json; do
        if [[ -f "$report" ]]; then
            local errors=$(jq '.results.invalid_records // .results.incomplete_records // .results.duplicate_records // 0' "$report" 2>/dev/null || echo "0")
            total_issues=$((total_issues + errors))
            
            # Critical if required fields or lookups fail
            if [[ "$report" == *"required"* ]] || [[ "$report" == *"lookup"* ]]; then
                critical_issues=$((critical_issues + errors))
            fi
        fi
    done
    
    local record_count=$(count_csv_records "$CSV_FILE")
    local risk_score=$((100 - (total_issues * 100 / record_count)))
    local risk_class="risk-low"
    local risk_label="Low Risk"
    
    if [[ $risk_score -lt 50 ]]; then
        risk_class="risk-high"
        risk_label="High Risk"
    elif [[ $risk_score -lt 80 ]]; then
        risk_class="risk-medium"
        risk_label="Medium Risk"
    fi
    
    cat >> "$report_file" <<EOF
    <div class="summary">
        <h2>Overall Assessment</h2>
        <div class="risk-score $risk_class">$risk_score%</div>
        <p style="text-align: center; font-size: 18px;">Import Success Likelihood: <strong>$risk_label</strong></p>
        
        <div style="text-align: center;">
            <div class="metric">
                <div class="metric-value">$record_count</div>
                <div class="metric-label">Total Records</div>
            </div>
            <div class="metric">
                <div class="metric-value">$total_issues</div>
                <div class="metric-label">Total Issues</div>
            </div>
            <div class="metric">
                <div class="metric-value">$critical_issues</div>
                <div class="metric-label">Critical Issues</div>
            </div>
        </div>
    </div>
EOF
    
    # Add individual validator results
    for validator in "${VALIDATORS[@]}"; do
        local validator_script="${validator%:*}"
        local validator_name="${validator#*:}"
        local log_file="$VALIDATION_DIR/${validator_script}.log"
        local report_json="$VALIDATION_DIR/*${validator_script%-*}*-report.json"
        
        local status_class="warning"
        local status_text="Not Run"
        
        if [[ -f "$log_file" ]]; then
            if grep -q "✓\|passed\|complete" "$log_file"; then
                status_class="pass"
                status_text="Passed"
            elif grep -q "✗\|failed\|error" "$log_file"; then
                status_class="fail"
                status_text="Failed"
            fi
        fi
        
        cat >> "$report_file" <<EOF
    <div class="validator $status_class">
        <h3>$validator_name - $status_text</h3>
EOF
        
        # Add validator-specific details
        for json_report in $report_json; do
            if [[ -f "$json_report" ]]; then
                local results=$(jq '.results' "$json_report" 2>/dev/null)
                if [[ -n "$results" ]]; then
                    echo "<table>" >> "$report_file"
                    echo "$results" | jq -r 'to_entries[] | "<tr><td>\(.key | gsub("_"; " ") | split(" ") | map(.[0:1] | ascii_upcase + .[1:]) | join(" "))</td><td><strong>\(.value)</strong></td></tr>"' >> "$report_file"
                    echo "</table>" >> "$report_file"
                fi
                
                # Add output files
                local files=$(jq -r '.output_files | to_entries[] | "\(.key): \(.value)"' "$json_report" 2>/dev/null)
                if [[ -n "$files" ]]; then
                    echo "<div class='files'><strong>Output Files:</strong><br>" >> "$report_file"
                    echo "$files" | while read -r file_info; do
                        echo "<code>$file_info</code><br>" >> "$report_file"
                    done
                    echo "</div>" >> "$report_file"
                fi
            fi
        done
        
        echo "</div>" >> "$report_file"
    done
    
    # Add recommendations
    cat >> "$report_file" <<EOF
    <div class="summary">
        <h2>Recommendations</h2>
        <ol>
EOF
    
    if [[ $critical_issues -gt 0 ]]; then
        echo "<li><strong>Critical:</strong> Fix lookup and required field issues before import</li>" >> "$report_file"
    fi
    
    if [[ $total_issues -gt 0 ]]; then
        echo "<li>Review and fix validation errors in generated error files</li>" >> "$report_file"
        [[ "$AUTO_FIX" != true ]] && echo "<li>Consider running with -f flag for auto-fix</li>" >> "$report_file"
    fi
    
    echo "<li>Use the clean/valid output files for import</li>" >> "$report_file"
    echo "<li>Test with a small batch first</li>" >> "$report_file"
    
    cat >> "$report_file" <<EOF
        </ol>
    </div>
    
    <div class="files">
        <h3>Validation Directory</h3>
        <code>$VALIDATION_DIR</code>
    </div>
</body>
</html>
EOF
    
    log_success "Report generated: $report_file"
}

# Main execution
echo
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          SALESFORCE DATA VALIDATION SUITE                      ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║ File:     $(printf "%-52s" "$CSV_FILE") ║"
echo "║ Object:   $(printf "%-52s" "$OBJECT_NAME") ║"
echo "║ Org:      $(printf "%-52s" "$ORG") ║"
echo "║ Mode:     $(printf "%-52s" "$VALIDATION_MODE") ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo

# Count records
RECORD_COUNT=$(count_csv_records "$CSV_FILE")
log_info "Validating $RECORD_COUNT records..."

# Determine which validators to run based on mode
case "$VALIDATION_MODE" in
    quick)
        VALIDATORS=(
            "validate-picklists.sh:Picklist Restrictions"
            "validate-required.sh:Required Fields"
        )
        ;;
    thorough)
        VALIDATORS=(
            "validate-picklists.sh:Picklist Restrictions"
            "validate-lookups.sh:Lookup Relationships"
            "validate-required.sh:Required Fields"
            "validate-duplicates.sh:Duplicate Prevention"
        )
        STOP_ON_ERROR=true
        ;;
esac

# Run validators in sequence
CURRENT_FILE="$WORKING_FILE"
STEP=1
TOTAL_STEPS=${#VALIDATORS[@]}
ALL_PASSED=true

for validator in "${VALIDATORS[@]}"; do
    NEXT_FILE=$(run_validator "$validator" "$CURRENT_FILE" "$STEP" "$TOTAL_STEPS")
    
    if [[ $? -ne 0 ]]; then
        ALL_PASSED=false
        [[ "$STOP_ON_ERROR" == true ]] && break
    fi
    
    # Use output from previous validator as input to next
    [[ -n "$NEXT_FILE" ]] && [[ -f "$NEXT_FILE" ]] && CURRENT_FILE="$NEXT_FILE"
    
    ((STEP++))
done

# Copy final clean file
if [[ "$CURRENT_FILE" != "$WORKING_FILE" ]]; then
    cp "$CURRENT_FILE" "$VALIDATION_DIR/final_clean.csv"
    log_success "Final clean file: $VALIDATION_DIR/final_clean.csv"
fi

# Generate unified report
[[ "$GENERATE_REPORT" == true ]] && generate_unified_report

# Final summary
echo
echo "════════════════════════════════════════════════════════════════"
echo " VALIDATION COMPLETE"
echo "════════════════════════════════════════════════════════════════"
echo
echo "Results saved to: $VALIDATION_DIR"
echo

if [[ "$ALL_PASSED" == true ]]; then
    log_success "All validations passed! Data is ready for import."
    echo "Use this file for import: $VALIDATION_DIR/final_clean.csv"
    exit 0
else
    log_warning "Some validations failed. Review the reports and fix issues before import."
    echo "Check individual validator outputs in: $VALIDATION_DIR"
    exit 1
fi