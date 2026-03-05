#!/bin/bash

##############################################################################
# unified-data-validator.sh - Consolidated Data Validation System
##############################################################################
# This script consolidates functionality from:
# - pre-import-validator.sh (validation rule checking)
# - validation-rule-manager.sh (rule caching and analysis)
# - run_contract_validation_analysis.sh (contract-specific validation)
#
# Provides comprehensive data validation with:
# - SOQL query validation and optimization
# - CSV data structure validation
# - Salesforce validation rules checking
# - Field requirement analysis
# - Data quality assessments
# - Contract-specific validation patterns
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
CACHE_DIR="${PROJECT_ROOT}/.validation-cache"
LOG_DIR="${PROJECT_ROOT}/logs/validation"
REPORTS_DIR="${PROJECT_ROOT}/reports/validation"
RULES_DB="${CACHE_DIR}/validation_rules.db"
PATTERNS_FILE="${CACHE_DIR}/validation_patterns.json"

# Create necessary directories
mkdir -p "$CACHE_DIR" "$LOG_DIR" "$REPORTS_DIR"

# Global variables
VERBOSE=false
FORCE_REFRESH=false
AUTO_FIX=true
VALIDATION_MODE="standard"
LOG_FILE=""

# Available validation modes
declare -a VALIDATION_MODES=("quick" "standard" "thorough" "contract")

# Function to display usage
usage() {
    cat << 'EOF'
Usage: unified-data-validator.sh [OPTIONS]

Consolidated data validation system for Salesforce operations.

VALIDATION TYPES:
    -t csv          Validate CSV file structure and content
    -t soql         Validate SOQL query syntax and performance
    -t rules        Validate against Salesforce validation rules
    -t fields       Validate field requirements and accessibility
    -t contract     Run contract-specific validation patterns
    -t all          Run all validation types (default)

REQUIRED OPTIONS (for specific validations):
    -f FILE         CSV file to validate (for csv validation)
    -q QUERY        SOQL query to validate (for soql validation)
    -o OBJECT       Salesforce object name (for rules/fields validation)

OPTIONAL PARAMETERS:
    -a ALIAS        Salesforce org alias (uses default if not specified)
    -m MODE         Validation mode: quick, standard, thorough, contract (default: standard)
    -r              Force refresh of cached validation rules
    -x              Auto-fix issues where possible (default: enabled)
    -X              Disable auto-fix of issues
    -s              Save detailed validation report
    -v              Verbose output
    -h              Display this help message

EXAMPLES:
    # Validate CSV file structure
    unified-data-validator.sh -t csv -f data.csv -o Account

    # Validate SOQL query
    unified-data-validator.sh -t soql -q "SELECT Id, Name FROM Account"

    # Validate against object rules
    unified-data-validator.sh -t rules -o Contact -a myorg

    # Comprehensive validation with report
    unified-data-validator.sh -t all -f data.csv -o Account -m thorough -s

    # Contract-specific validation
    unified-data-validator.sh -t contract -f contracts.csv -o Contract -m contract

EOF
    exit 1
}

# Logging functions
setup_logging() {
    local validation_type="${1:-general}"
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    LOG_FILE="${LOG_DIR}/${validation_type}_validation_${timestamp}.log"
    
    cat > "$LOG_FILE" << EOF
# Unified Data Validator Log
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
    fi
}

# Initialize SQLite database for validation rules
init_validation_database() {
    log DEBUG "Initializing validation database..."
    
    sqlite3 "$RULES_DB" << 'EOF'
CREATE TABLE IF NOT EXISTS validation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_alias TEXT NOT NULL,
    object_name TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    active BOOLEAN NOT NULL,
    description TEXT,
    error_formula TEXT,
    error_message TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_alias, object_name, rule_name)
);

CREATE TABLE IF NOT EXISTS field_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_alias TEXT NOT NULL,
    object_name TEXT NOT NULL,
    field_name TEXT NOT NULL,
    required BOOLEAN DEFAULT FALSE,
    data_type TEXT,
    length INTEGER,
    precision_scale TEXT,
    default_value TEXT,
    picklist_values TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_alias, object_name, field_name)
);

CREATE TABLE IF NOT EXISTS validation_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_name TEXT UNIQUE NOT NULL,
    object_type TEXT NOT NULL,
    pattern_type TEXT NOT NULL,
    validation_logic TEXT NOT NULL,
    error_message TEXT,
    severity TEXT DEFAULT 'WARNING',
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_validation_rules_object ON validation_rules(org_alias, object_name);
CREATE INDEX IF NOT EXISTS idx_field_requirements_object ON field_requirements(org_alias, object_name);
CREATE INDEX IF NOT EXISTS idx_validation_patterns_type ON validation_patterns(object_type, pattern_type);
EOF

    log DEBUG "Database initialized successfully"
}

# Fetch validation rules from Salesforce
fetch_validation_rules() {
    local object="$1"
    local org_alias="$2"
    local force_refresh="$3"
    
    # Check if we need to refresh cache
    local cache_timestamp=$(sqlite3 "$RULES_DB" "SELECT MAX(last_updated) FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object'" 2>/dev/null || echo "")
    
    if [[ "$force_refresh" != "true" ]] && [[ -n "$cache_timestamp" ]]; then
        # Check if cache is less than 24 hours old
        local cache_age=$(sqlite3 "$RULES_DB" "SELECT (julianday('now') - julianday('$cache_timestamp')) * 24")
        if (( $(echo "$cache_age < 24" | bc -l 2>/dev/null || echo "0") )); then
            log INFO "Using cached validation rules for $object"
            return 0
        fi
    fi
    
    log PROGRESS "Fetching validation rules from Salesforce for $object..."
    
    # Build SOQL query for validation rules (without ErrorConditionFormula which requires individual queries)
    local query="SELECT Id, ValidationName, Active, Description, ErrorMessage, ErrorDisplayField FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '$object' AND Active = true"
    
    # Execute query using Tooling API
    local temp_file="${CACHE_DIR}/temp_rules_$$.json"
    local sf_args=("data" "query" "--query" "$query" "--use-tooling-api" "--json")
    
    if [[ -n "$org_alias" ]]; then
        sf_args+=("--target-org" "$org_alias")
    fi
    
    if sf "${sf_args[@]}" > "$temp_file"; then
        # Parse and store results
        local rules_count=$(jq -r '.result.records | length' "$temp_file" 2>/dev/null || echo "0")
        
        if [[ "$rules_count" -gt 0 ]]; then
            log INFO "Found $rules_count validation rules for $object"
            
            # Clear existing rules for this object
            sqlite3 "$RULES_DB" "DELETE FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object'"
            
            # Insert new rules
            jq -r '.result.records[] | @base64' "$temp_file" | while read -r rule; do
                local decoded=$(echo "$rule" | base64 --decode)
                local rule_name=$(echo "$decoded" | jq -r '.ValidationName')
                local active=$(echo "$decoded" | jq -r '.Active')
                local description=$(echo "$decoded" | jq -r '.Description // ""')
                local error_formula=$(echo "$decoded" | jq -r '.ErrorConditionFormula // ""')
                local error_message=$(echo "$decoded" | jq -r '.ErrorMessage // ""')
                
                sqlite3 "$RULES_DB" "INSERT OR REPLACE INTO validation_rules 
                    (org_alias, object_name, rule_name, active, description, error_formula, error_message) 
                    VALUES ('$org_alias', '$object', '$rule_name', '$active', '$description', '$error_formula', '$error_message')"
            done
            
            log SUCCESS "Validation rules cached successfully"
        else
            log INFO "No active validation rules found for $object"
        fi
    else
        log WARNING "Failed to fetch validation rules from Salesforce"
    fi
    
    rm -f "$temp_file"
}

# Fetch field requirements
fetch_field_requirements() {
    local object="$1"
    local org_alias="$2"
    
    log PROGRESS "Fetching field requirements for $object..."
    
    local query="SELECT QualifiedApiName, DataType, Length, Precision, Scale, IsNillable, DefaultValue, PicklistValues FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '$object'"
    
    local temp_file="${CACHE_DIR}/temp_fields_$$.json"
    local sf_args=("data" "query" "--query" "$query" "--use-tooling-api" "--json")
    
    if [[ -n "$org_alias" ]]; then
        sf_args+=("--target-org" "$org_alias")
    fi
    
    if sf "${sf_args[@]}" > "$temp_file"; then
        local fields_count=$(jq -r '.result.records | length' "$temp_file" 2>/dev/null || echo "0")
        
        if [[ "$fields_count" -gt 0 ]]; then
            log INFO "Found $fields_count fields for $object"
            
            # Clear existing field requirements for this object
            sqlite3 "$RULES_DB" "DELETE FROM field_requirements WHERE org_alias='$org_alias' AND object_name='$object'"
            
            # Insert field requirements
            jq -r '.result.records[] | @base64' "$temp_file" | while read -r field; do
                local decoded=$(echo "$field" | base64 --decode)
                local field_name=$(echo "$decoded" | jq -r '.QualifiedApiName')
                local data_type=$(echo "$decoded" | jq -r '.DataType')
                local length=$(echo "$decoded" | jq -r '.Length // 0')
                local precision=$(echo "$decoded" | jq -r '.Precision // 0')
                local scale=$(echo "$decoded" | jq -r '.Scale // 0')
                local required=$(echo "$decoded" | jq -r '.IsNillable == false')
                local default_value=$(echo "$decoded" | jq -r '.DefaultValue // ""')
                
                local precision_scale=""
                if [[ "$precision" != "0" ]] && [[ "$precision" != "null" ]]; then
                    precision_scale="${precision}"
                    if [[ "$scale" != "0" ]] && [[ "$scale" != "null" ]]; then
                        precision_scale="${precision},${scale}"
                    fi
                fi
                
                sqlite3 "$RULES_DB" "INSERT OR REPLACE INTO field_requirements 
                    (org_alias, object_name, field_name, required, data_type, length, precision_scale, default_value) 
                    VALUES ('$org_alias', '$object', '$field_name', '$required', '$data_type', '$length', '$precision_scale', '$default_value')"
            done
            
            log SUCCESS "Field requirements cached successfully"
        fi
    else
        log WARNING "Failed to fetch field requirements from Salesforce"
    fi
    
    rm -f "$temp_file"
}

# CSV Structure Validation
validate_csv_structure() {
    local csv_file="$1"
    local object="$2"
    local org_alias="$3"
    
    log PROGRESS "Validating CSV structure..."
    
    local validation_results=()
    local issues_found=0
    local fixes_applied=0
    
    # Basic file checks
    if [[ ! -f "$csv_file" ]]; then
        log ERROR "CSV file not found: $csv_file"
        return 1
    fi
    
    if [[ ! -r "$csv_file" ]]; then
        log ERROR "CSV file not readable: $csv_file"
        return 1
    fi
    
    if [[ ! -s "$csv_file" ]]; then
        log ERROR "CSV file is empty: $csv_file"
        return 1
    fi
    
    # File statistics
    local line_count=$(wc -l < "$csv_file")
    local file_size=$(stat -f%z "$csv_file" 2>/dev/null || stat -c%s "$csv_file" 2>/dev/null)
    local headers=$(head -n 1 "$csv_file")
    local field_count=$(echo "$headers" | awk -F',' '{print NF}')
    
    log INFO "CSV Statistics: $line_count lines, $(numfmt --to=iec $file_size), $field_count fields"
    validation_results+=("File contains $((line_count-1)) data records with $field_count fields")
    
    # Check line endings
    local line_endings="LF"
    if file "$csv_file" | grep -q "CRLF"; then
        line_endings="CRLF"
    elif file "$csv_file" | grep -q "CR"; then
        line_endings="CR"
    fi
    
    validation_results+=("Line endings: $line_endings")
    
    # Check for common CSV issues
    local temp_file="${csv_file}.validation_temp"
    cp "$csv_file" "$temp_file"
    
    # BOM check
    if head -c 3 "$temp_file" | grep -q $'\xef\xbb\xbf'; then
        validation_results+=("BOM marker detected")
        ((issues_found++))
        if [[ "$AUTO_FIX" == "true" ]]; then
            log INFO "Removing BOM marker..."
            sed -i '1s/^\xEF\xBB\xBF//' "$temp_file"
            ((fixes_applied++))
        fi
    fi
    
    # Empty lines check
    local empty_lines=$(grep -c '^[[:space:]]*$' "$temp_file" || echo "0")
    if [[ $empty_lines -gt 0 ]]; then
        validation_results+=("$empty_lines empty lines found")
        ((issues_found++))
        if [[ "$AUTO_FIX" == "true" ]]; then
            log INFO "Removing empty lines..."
            sed -i '/^[[:space:]]*$/d' "$temp_file"
            ((fixes_applied++))
        fi
    fi
    
    # Field consistency check
    local inconsistent_fields=0
    local line_num=1
    while IFS= read -r line; do
        local current_fields=$(echo "$line" | awk -F',' '{print NF}')
        if [[ $current_fields -ne $field_count ]]; then
            ((inconsistent_fields++))
            if [[ $inconsistent_fields -le 5 ]]; then  # Only log first 5 occurrences
                validation_results+=("Line $line_num has $current_fields fields (expected $field_count)")
            fi
        fi
        ((line_num++))
    done < "$csv_file"
    
    if [[ $inconsistent_fields -gt 0 ]]; then
        validation_results+=("$inconsistent_fields lines with inconsistent field counts")
        ((issues_found++))
    fi
    
    # Replace original file if fixes were applied
    if [[ $fixes_applied -gt 0 ]]; then
        mv "$temp_file" "$csv_file"
        log SUCCESS "Applied $fixes_applied automatic fixes"
    else
        rm -f "$temp_file"
    fi
    
    # Report results
    log RESULT "CSV Structure Validation Results:"
    for result in "${validation_results[@]}"; do
        log RESULT "  • $result"
    done
    
    if [[ $issues_found -eq 0 ]]; then
        log SUCCESS "CSV structure validation passed"
        return 0
    else
        log WARNING "CSV structure validation found $issues_found issues"
        if [[ $fixes_applied -eq $issues_found ]]; then
            log SUCCESS "All issues were automatically fixed"
            return 0
        else
            return 1
        fi
    fi
}

# SOQL Query Validation
validate_soql_query() {
    local query="$1"
    local org_alias="$2"
    
    log PROGRESS "Validating SOQL query..."
    
    local validation_results=()
    local issues_found=0
    
    # Basic syntax checks
    if [[ -z "$query" ]]; then
        log ERROR "SOQL query is empty"
        return 1
    fi
    
    # Check for SELECT keyword
    if ! echo "$query" | grep -qi "SELECT"; then
        validation_results+=("Missing SELECT keyword")
        ((issues_found++))
    fi
    
    # Check for FROM keyword
    if ! echo "$query" | grep -qi "FROM"; then
        validation_results+=("Missing FROM keyword")
        ((issues_found++))
    fi
    
    # Performance checks
    if echo "$query" | grep -qi "SELECT.*\*"; then
        validation_results+=("Using SELECT * may impact performance")
        ((issues_found++))
    fi
    
    if ! echo "$query" | grep -qi "LIMIT"; then
        validation_results+=("Consider adding LIMIT clause for better performance")
        ((issues_found++))
    fi
    
    # Security checks
    if echo "$query" | grep -qi "WITH SECURITY_ENFORCED"; then
        validation_results+=("Using WITH SECURITY_ENFORCED (recommended)")
    else
        validation_results+=("Consider adding WITH SECURITY_ENFORCED for security")
        ((issues_found++))
    fi
    
    # Try to validate with Salesforce (if org_alias provided)
    if [[ -n "$org_alias" ]]; then
        log DEBUG "Testing query execution with Salesforce..."
        local temp_file="${CACHE_DIR}/query_test_$$.json"
        
        # Test with LIMIT 1 to avoid large results
        local test_query="$query"
        if ! echo "$test_query" | grep -qi "LIMIT"; then
            test_query="$test_query LIMIT 1"
        fi
        
        local sf_args=("data" "query" "--query" "$test_query" "--target-org" "$org_alias" "--json")
        
        if sf "${sf_args[@]}" > "$temp_file" 2>/dev/null; then
            validation_results+=("Query executed successfully against org")
        else
            validation_results+=("Query execution failed against org")
            ((issues_found++))
        fi
        
        rm -f "$temp_file"
    fi
    
    # Report results
    log RESULT "SOQL Query Validation Results:"
    for result in "${validation_results[@]}"; do
        log RESULT "  • $result"
    done
    
    if [[ $issues_found -eq 0 ]]; then
        log SUCCESS "SOQL query validation passed"
        return 0
    else
        log WARNING "SOQL query validation found $issues_found issues"
        return 1
    fi
}

# Validation Rules Check
validate_against_rules() {
    local object="$1"
    local csv_file="$2"
    local org_alias="$3"
    
    log PROGRESS "Validating against Salesforce validation rules..."
    
    # Ensure we have current validation rules
    fetch_validation_rules "$object" "$org_alias" "$FORCE_REFRESH"
    
    # Get validation rules from database
    local rules_count=$(sqlite3 "$RULES_DB" "SELECT COUNT(*) FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object' AND active=1")
    
    if [[ "$rules_count" -eq 0 ]]; then
        log INFO "No active validation rules found for $object"
        return 0
    fi
    
    log INFO "Found $rules_count active validation rules for $object"
    
    local validation_results=()
    local issues_found=0
    
    # For CSV validation, we can only do basic field presence checks
    # Full formula validation would require data loading
    if [[ -n "$csv_file" ]]; then
        local headers=$(head -n 1 "$csv_file")
        
        # Check for common required fields based on validation rules
        sqlite3 "$RULES_DB" "SELECT rule_name, error_message FROM validation_rules WHERE org_alias='$org_alias' AND object_name='$object' AND active=1" | while IFS='|' read -r rule_name error_message; do
            validation_results+=("Active rule: $rule_name")
            if [[ -n "$error_message" ]]; then
                validation_results+=("  Error: $error_message")
            fi
        done
    fi
    
    # Report results
    log RESULT "Validation Rules Check Results:"
    log RESULT "  • $rules_count active validation rules found"
    log RESULT "  • Rules will be enforced during data import"
    
    log SUCCESS "Validation rules check completed"
    return 0
}

# Field Requirements Validation
validate_field_requirements() {
    local object="$1"
    local csv_file="$2"
    local org_alias="$3"
    
    log PROGRESS "Validating field requirements..."
    
    # Ensure we have current field requirements
    fetch_field_requirements "$object" "$org_alias"
    
    if [[ -z "$csv_file" ]]; then
        log INFO "No CSV file provided, skipping field mapping validation"
        return 0
    fi
    
    local validation_results=()
    local issues_found=0
    local headers=$(head -n 1 "$csv_file")
    
    # Convert CSV headers to array
    IFS=',' read -ra csv_headers <<< "$headers"
    
    # Clean headers (remove quotes and trim spaces)
    for i in "${!csv_headers[@]}"; do
        csv_headers[i]=$(echo "${csv_headers[i]}" | sed 's/^"//;s/"$//' | xargs)
    done
    
    log INFO "CSV headers: ${csv_headers[*]}"
    
    # Get required fields from database
    local required_fields=$(sqlite3 "$RULES_DB" "SELECT field_name FROM field_requirements WHERE org_alias='$org_alias' AND object_name='$object' AND required=1")
    
    if [[ -n "$required_fields" ]]; then
        while IFS= read -r required_field; do
            local field_found=false
            for csv_header in "${csv_headers[@]}"; do
                if [[ "$csv_header" == "$required_field" ]]; then
                    field_found=true
                    break
                fi
            done
            
            if [[ "$field_found" == "false" ]]; then
                validation_results+=("Required field missing: $required_field")
                ((issues_found++))
            else
                validation_results+=("Required field present: $required_field")
            fi
        done <<< "$required_fields"
    fi
    
    # Check for unknown fields
    for csv_header in "${csv_headers[@]}"; do
        local field_exists=$(sqlite3 "$RULES_DB" "SELECT COUNT(*) FROM field_requirements WHERE org_alias='$org_alias' AND object_name='$object' AND field_name='$csv_header'")
        
        if [[ "$field_exists" -eq 0 ]]; then
            validation_results+=("Unknown field in CSV: $csv_header")
            ((issues_found++))
        fi
    done
    
    # Report results
    log RESULT "Field Requirements Validation Results:"
    for result in "${validation_results[@]}"; do
        log RESULT "  • $result"
    done
    
    if [[ $issues_found -eq 0 ]]; then
        log SUCCESS "Field requirements validation passed"
        return 0
    else
        log WARNING "Field requirements validation found $issues_found issues"
        return 1
    fi
}

# Contract-specific validation patterns
validate_contract_patterns() {
    local csv_file="$1"
    local object="$2"
    
    log PROGRESS "Running contract-specific validation patterns..."
    
    if [[ "$object" != "Contract" ]] && [[ "$object" != *"Contract"* ]]; then
        log INFO "Skipping contract validation for non-contract object: $object"
        return 0
    fi
    
    local validation_results=()
    local issues_found=0
    
    if [[ -n "$csv_file" ]] && [[ -f "$csv_file" ]]; then
        # Contract-specific validation patterns
        local headers=$(head -n 1 "$csv_file")
        
        # Check for essential contract fields
        local essential_fields=("AccountId" "Status" "ContractTerm" "StartDate")
        for field in "${essential_fields[@]}"; do
            if echo "$headers" | grep -q "$field"; then
                validation_results+=("Essential field present: $field")
            else
                validation_results+=("Essential field missing: $field")
                ((issues_found++))
            fi
        done
        
        # Check for date consistency
        if echo "$headers" | grep -q "StartDate" && echo "$headers" | grep -q "EndDate"; then
            validation_results+=("Date fields present for validation")
            # Note: Actual date validation would require processing all records
        fi
        
        # Check for valid status values (if Status field exists)
        if echo "$headers" | grep -q "Status"; then
            validation_results+=("Status field present - ensure values are valid")
        fi
    fi
    
    # Report results
    log RESULT "Contract Validation Patterns Results:"
    for result in "${validation_results[@]}"; do
        log RESULT "  • $result"
    done
    
    if [[ $issues_found -eq 0 ]]; then
        log SUCCESS "Contract validation patterns passed"
        return 0
    else
        log WARNING "Contract validation patterns found $issues_found issues"
        return 1
    fi
}

# Generate validation report
generate_validation_report() {
    local report_file="$1"
    local validation_type="$2"
    local results="$3"
    
    log INFO "Generating validation report: $report_file"
    
    cat > "$report_file" << EOF
# Data Validation Report
Generated: $(date)
Validation Type: $validation_type
Log File: $LOG_FILE

## Summary
$results

## Detailed Analysis
See log file for complete details: $LOG_FILE

## Recommendations
EOF
    
    # Add recommendations based on validation results
    if echo "$results" | grep -q "issues"; then
        cat >> "$report_file" << EOF
- Review and resolve identified issues before proceeding
- Consider using auto-fix options for common issues
- Validate data quality at source systems
EOF
    else
        cat >> "$report_file" << EOF
- Validation passed successfully
- Data appears ready for import/processing
- Monitor for any runtime issues during execution
EOF
    fi
    
    log SUCCESS "Report generated: $report_file"
}

# Main execution function
main() {
    # Initialize variables
    local validation_type="all"
    local csv_file=""
    local soql_query=""
    local object=""
    local org_alias=""
    local save_report=false
    
    # Parse command line arguments
    while getopts "t:f:q:o:a:m:rxXsvh" opt; do
        case $opt in
            t) validation_type="$OPTARG";;
            f) csv_file="$OPTARG";;
            q) soql_query="$OPTARG";;
            o) object="$OPTARG";;
            a) org_alias="$OPTARG";;
            m) VALIDATION_MODE="$OPTARG";;
            r) FORCE_REFRESH=true;;
            x) AUTO_FIX=true;;
            X) AUTO_FIX=false;;
            s) save_report=true;;
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
    echo -e "${GREEN}=== Unified Data Validator ===${NC}"
    echo -e "${BLUE}Validation Type:${NC} $validation_type"
    echo -e "${BLUE}Mode:${NC} $VALIDATION_MODE"
    [[ -n "$object" ]] && echo -e "${BLUE}Object:${NC} $object"
    [[ -n "$csv_file" ]] && echo -e "${BLUE}CSV File:${NC} $csv_file"
    [[ -n "$soql_query" ]] && echo -e "${BLUE}SOQL Query:${NC} $soql_query"
    [[ -n "$org_alias" ]] && echo -e "${BLUE}Org Alias:${NC} $org_alias"
    echo ""
    
    # Initialize database
    init_validation_database
    
    # Execute validation based on type
    local validation_success=true
    local validation_results=""
    
    case "$validation_type" in
        csv)
            if [[ -z "$csv_file" ]]; then
                log ERROR "CSV file is required for csv validation type"
                exit 1
            fi
            if ! validate_csv_structure "$csv_file" "$object" "$org_alias"; then
                validation_success=false
            fi
            validation_results="CSV structure validation completed"
            ;;
            
        soql)
            if [[ -z "$soql_query" ]]; then
                log ERROR "SOQL query is required for soql validation type"
                exit 1
            fi
            if ! validate_soql_query "$soql_query" "$org_alias"; then
                validation_success=false
            fi
            validation_results="SOQL query validation completed"
            ;;
            
        rules)
            if [[ -z "$object" ]]; then
                log ERROR "Object name is required for rules validation type"
                exit 1
            fi
            if ! validate_against_rules "$object" "$csv_file" "$org_alias"; then
                validation_success=false
            fi
            validation_results="Validation rules check completed"
            ;;
            
        fields)
            if [[ -z "$object" ]]; then
                log ERROR "Object name is required for fields validation type"
                exit 1
            fi
            if ! validate_field_requirements "$object" "$csv_file" "$org_alias"; then
                validation_success=false
            fi
            validation_results="Field requirements validation completed"
            ;;
            
        contract)
            if ! validate_contract_patterns "$csv_file" "$object"; then
                validation_success=false
            fi
            validation_results="Contract validation patterns completed"
            ;;
            
        all)
            local all_passed=true
            
            if [[ -n "$csv_file" ]] && [[ -n "$object" ]]; then
                if ! validate_csv_structure "$csv_file" "$object" "$org_alias"; then
                    all_passed=false
                fi
            fi
            
            if [[ -n "$soql_query" ]]; then
                if ! validate_soql_query "$soql_query" "$org_alias"; then
                    all_passed=false
                fi
            fi
            
            if [[ -n "$object" ]]; then
                if ! validate_against_rules "$object" "$csv_file" "$org_alias"; then
                    all_passed=false
                fi
                if ! validate_field_requirements "$object" "$csv_file" "$org_alias"; then
                    all_passed=false
                fi
            fi
            
            if [[ -n "$csv_file" ]] && [[ -n "$object" ]]; then
                if ! validate_contract_patterns "$csv_file" "$object"; then
                    all_passed=false
                fi
            fi
            
            if [[ "$all_passed" != "true" ]]; then
                validation_success=false
            fi
            validation_results="Comprehensive validation completed"
            ;;
            
        *)
            log ERROR "Unknown validation type: $validation_type"
            exit 1
            ;;
    esac
    
    # Generate report if requested
    if [[ "$save_report" == "true" ]]; then
        local report_file="${REPORTS_DIR}/validation_report_$(date +%Y%m%d_%H%M%S).md"
        generate_validation_report "$report_file" "$validation_type" "$validation_results"
    fi
    
    # Report final results
    if [[ "$validation_success" == "true" ]]; then
        log SUCCESS "All validations passed successfully!"
        log INFO "Log file: $LOG_FILE"
        exit 0
    else
        log ERROR "Some validations failed. Check log file for details: $LOG_FILE"
        exit 1
    fi
}

# Execute main function
main "$@"
