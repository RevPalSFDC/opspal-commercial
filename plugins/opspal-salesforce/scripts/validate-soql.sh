#!/bin/bash

##############################################################################
# validate-soql.sh - SOQL Query Validation and Optimization Script
##############################################################################
# Validates SOQL queries before execution, checks for common errors,
# and provides optimization suggestions
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

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Load Node.js and Python helpers
NODE_HELPER="${SCRIPT_DIR}/soql-query-builder.js"
PYTHON_HELPER="${SCRIPT_DIR}/soql_helper.py"

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] -q "SOQL_QUERY"

Validates and optimizes SOQL queries before execution.

OPTIONS:
    -q QUERY        SOQL query to validate
    -f FILE         Read query from file
    -o OBJECT       Validate against specific object
    -a ALIAS        Salesforce org alias for metadata validation
    -x FIX          Attempt to fix errors (y/n, default: n)
    -p              Check performance implications
    -s              Suggest optimizations
    -t              Test query execution (dry run)
    -v              Verbose output
    -h              Display this help

EXAMPLES:
    # Validate a simple query
    $0 -q "SELECT Id, Name FROM Account"

    # Validate and fix a query with reserved keywords
    $0 -q "SELECT COUNT(Id) count FROM Opportunity" -x y

    # Full validation with performance check
    $0 -q "SELECT * FROM Contact WHERE Email LIKE '%@%'" -p -s

    # Validate query from file
    $0 -f my_query.soql -o Account -a myorg

EOF
    exit 1
}

# Function to log messages
log_message() {
    local level="$1"
    shift
    local message="$*"
    
    case "$level" in
        ERROR)   echo -e "${RED}✗ $message${NC}" ;;
        WARNING) echo -e "${YELLOW}⚠ $message${NC}" ;;
        SUCCESS) echo -e "${GREEN}✓ $message${NC}" ;;
        INFO)    echo -e "${BLUE}ℹ $message${NC}" ;;
        DEBUG)   [[ $VERBOSE == true ]] && echo -e "${CYAN}  $message${NC}" ;;
    esac
}

# Function to check for reserved keywords
check_reserved_keywords() {
    local query="$1"
    local has_issues=false
    
    # Reserved keywords that commonly cause issues as aliases
    local reserved_keywords=(
        "count" "sum" "avg" "max" "min"
        "group" "order" "limit" "offset"
        "having" "rollup" "cube" "format"
        "update" "tracking" "data" "category"
    )
    
    log_message DEBUG "Checking for reserved keyword usage..."
    
    for keyword in "${reserved_keywords[@]}"; do
        # Check if keyword is used as an alias (after aggregate function or field)
        if echo "$query" | grep -iE "\b(COUNT|SUM|AVG|MAX|MIN)\([^)]+\)\s+$keyword\b" > /dev/null; then
            log_message WARNING "Reserved keyword '$keyword' used as alias"
            has_issues=true
        fi
    done
    
    return $([ "$has_issues" = true ] && echo 1 || echo 0)
}

# Function to validate query structure
validate_structure() {
    local query="$1"
    local errors=()
    
    log_message DEBUG "Validating query structure..."
    
    # Check for SELECT clause
    if ! echo "$query" | grep -iE '^\s*SELECT\s+' > /dev/null; then
        errors+=("Query must start with SELECT")
    fi
    
    # Check for FROM clause
    if ! echo "$query" | grep -iE '\s+FROM\s+' > /dev/null; then
        errors+=("Query must have FROM clause")
    fi
    
    # Check for SELECT *
    if echo "$query" | grep -iE 'SELECT\s+\*' > /dev/null; then
        log_message WARNING "SELECT * can impact performance and may not work with all objects"
    fi
    
    # Check for aggregate without GROUP BY
    if echo "$query" | grep -iE '\b(COUNT|SUM|AVG|MAX|MIN)\(' > /dev/null; then
        # Check if there are non-aggregate fields
        if echo "$query" | grep -iE 'SELECT.*[^(]*,' > /dev/null; then
            if ! echo "$query" | grep -iE '\s+GROUP\s+BY\s+' > /dev/null; then
                errors+=("Query with aggregates and non-aggregates requires GROUP BY")
            fi
        fi
    fi
    
    # Check for HAVING without GROUP BY
    if echo "$query" | grep -iE '\s+HAVING\s+' > /dev/null; then
        if ! echo "$query" | grep -iE '\s+GROUP\s+BY\s+' > /dev/null; then
            errors+=("HAVING clause requires GROUP BY")
        fi
    fi
    
    # Check LIMIT value
    if echo "$query" | grep -iE '\s+LIMIT\s+([0-9]+)' > /dev/null; then
        limit_value=$(echo "$query" | grep -oE 'LIMIT\s+([0-9]+)' | grep -oE '[0-9]+')
        if [[ $limit_value -gt 50000 ]]; then
            errors+=("LIMIT $limit_value exceeds Salesforce maximum of 50000")
        fi
    fi
    
    # Check OFFSET value
    if echo "$query" | grep -iE '\s+OFFSET\s+([0-9]+)' > /dev/null; then
        offset_value=$(echo "$query" | grep -oE 'OFFSET\s+([0-9]+)' | grep -oE '[0-9]+')
        if [[ $offset_value -gt 2000 ]]; then
            errors+=("OFFSET $offset_value exceeds Salesforce maximum of 2000")
        fi
    fi
    
    # Report errors
    if [[ ${#errors[@]} -gt 0 ]]; then
        for error in "${errors[@]}"; do
            log_message ERROR "$error"
        done
        return 1
    fi
    
    return 0
}

# Function to check performance implications
check_performance() {
    local query="$1"
    local score=100
    local issues=()
    
    log_message INFO "Analyzing query performance..."
    
    # Check for SELECT *
    if echo "$query" | grep -iE 'SELECT\s+\*' > /dev/null; then
        issues+=("SELECT * can impact performance - specify only needed fields")
        score=$((score - 20))
    fi
    
    # Check for missing WHERE clause
    if ! echo "$query" | grep -iE '\s+WHERE\s+' > /dev/null; then
        issues+=("No WHERE clause may return too many records")
        score=$((score - 30))
    fi
    
    # Check for NOT operators
    if echo "$query" | grep -iE '\bNOT\s+IN\b|!=' > /dev/null; then
        issues+=("NOT operators can be inefficient - consider positive conditions")
        score=$((score - 15))
    fi
    
    # Check for leading wildcards in LIKE
    if echo "$query" | grep -iE "LIKE\s+'%[^']+" > /dev/null; then
        issues+=("Leading wildcards in LIKE prevent index usage")
        score=$((score - 25))
    fi
    
    # Check for multiple OR conditions
    or_count=$(echo "$query" | grep -o -i '\bOR\b' | wc -l)
    if [[ $or_count -gt 3 ]]; then
        issues+=("Multiple OR conditions ($or_count) can impact performance")
        score=$((score - 10))
    fi
    
    # Check for missing LIMIT
    if ! echo "$query" | grep -iE '\s+LIMIT\s+' > /dev/null; then
        if ! echo "$query" | grep -iE '\b(COUNT|SUM|AVG|MAX|MIN)\(' > /dev/null; then
            issues+=("No LIMIT clause - consider adding to control result size")
            score=$((score - 10))
        fi
    fi
    
    # Report performance analysis
    echo -e "${CYAN}Performance Score: $score/100${NC}"
    
    if [[ ${#issues[@]} -gt 0 ]]; then
        echo -e "${YELLOW}Performance Considerations:${NC}"
        for issue in "${issues[@]}"; do
            echo -e "  ${YELLOW}•${NC} $issue"
        done
    else
        log_message SUCCESS "No performance issues detected"
    fi
    
    return 0
}

# Function to suggest optimizations
suggest_optimizations() {
    local query="$1"
    local suggestions=()
    
    log_message INFO "Generating optimization suggestions..."
    
    # Suggest indexes for WHERE fields
    if echo "$query" | grep -iE '\s+WHERE\s+' > /dev/null; then
        where_fields=$(echo "$query" | grep -oE 'WHERE\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=!<>]' | grep -oE '[A-Za-z_][A-Za-z0-9_]*' | head -1)
        if [[ -n "$where_fields" ]]; then
            suggestions+=("Consider indexing field: $where_fields")
        fi
    fi
    
    # Suggest field reduction
    field_count=$(echo "$query" | grep -oE 'SELECT\s+(.+)\s+FROM' | grep -o ',' | wc -l)
    field_count=$((field_count + 1))
    if [[ $field_count -gt 20 ]]; then
        suggestions+=("Large number of fields ($field_count) - consider reducing to necessary fields only")
    fi
    
    # Suggest using COUNT(Id) instead of COUNT(*)
    if echo "$query" | grep -iE 'COUNT\(\*\)' > /dev/null; then
        suggestions+=("Use COUNT(Id) instead of COUNT(*) for better performance")
    fi
    
    # Suggest date literal usage
    if echo "$query" | grep -iE "WHERE.*Date.*>.*'20" > /dev/null; then
        suggestions+=("Consider using date literals (THIS_YEAR, LAST_MONTH, etc.) for date filters")
    fi
    
    # Suggest relationship query optimization
    if echo "$query" | grep -iE '\.' > /dev/null; then
        suggestions+=("Relationship queries detected - ensure parent relationships are indexed")
    fi
    
    # Display suggestions
    if [[ ${#suggestions[@]} -gt 0 ]]; then
        echo -e "${CYAN}Optimization Suggestions:${NC}"
        for suggestion in "${suggestions[@]}"; do
            echo -e "  ${BLUE}→${NC} $suggestion"
        done
    else {
        log_message SUCCESS "Query is well-optimized"
    fi
    
    return 0
}

# Function to attempt to fix query
fix_query() {
    local query="$1"
    local fixed_query="$query"
    
    log_message INFO "Attempting to fix query issues..."
    
    # Use Python helper to fix the query
    if [[ -f "$PYTHON_HELPER" ]]; then
        fixed_query=$(python3 "$PYTHON_HELPER" fix "$query" 2>/dev/null | grep "Fixed:" | cut -d: -f2- | sed 's/^ *//')
        
        if [[ "$fixed_query" != "$query" ]]; then
            log_message SUCCESS "Query fixed successfully"
            echo -e "${GREEN}Fixed Query:${NC}"
            echo "$fixed_query"
            return 0
        fi
    fi
    
    # Fallback: Manual fixes for common issues
    # Fix reserved keywords as aliases
    fixed_query=$(echo "$fixed_query" | sed -E 's/\bCOUNT\(([^)]+)\)\s+count\b/COUNT(\1) recordCount/gi')
    fixed_query=$(echo "$fixed_query" | sed -E 's/\bSUM\(([^)]+)\)\s+sum\b/SUM(\1) sum_value/gi')
    fixed_query=$(echo "$fixed_query" | sed -E 's/\bAVG\(([^)]+)\)\s+avg\b/AVG(\1) avg_value/gi')
    fixed_query=$(echo "$fixed_query" | sed -E 's/\bMAX\(([^)]+)\)\s+max\b/MAX(\1) max_value/gi')
    fixed_query=$(echo "$fixed_query" | sed -E 's/\bMIN\(([^)]+)\)\s+min\b/MIN(\1) min_value/gi')
    
    # Fix missing aliases for aggregates
    fixed_query=$(echo "$fixed_query" | sed -E 's/\bCOUNT\(([^)]+)\)(\s*,|\s+FROM)/COUNT(\1) recordCount\2/gi')
    fixed_query=$(echo "$fixed_query" | sed -E 's/\bSUM\(([^)]+)\)(\s*,|\s+FROM)/SUM(\1) total_\1\2/gi')
    fixed_query=$(echo "$fixed_query" | sed -E 's/\bAVG\(([^)]+)\)(\s*,|\s+FROM)/AVG(\1) average_\1\2/gi')
    
    if [[ "$fixed_query" != "$query" ]]; then
        log_message SUCCESS "Query fixed"
        echo -e "${GREEN}Fixed Query:${NC}"
        echo "$fixed_query"
    else
        log_message WARNING "No automatic fixes applied"
    fi
    
    return 0
}

# Function to test query execution
test_execution() {
    local query="$1"
    local org_alias="$2"
    
    log_message INFO "Testing query execution (dry run)..."
    
    # Add LIMIT 1 for safety
    local test_query=$(echo "$query" | sed -E 's/(\s+LIMIT\s+[0-9]+)?$/LIMIT 1/')
    
    echo -e "${CYAN}Test Query:${NC}"
    echo "$test_query"
    
    if [[ -n "$org_alias" ]]; then
        log_message INFO "Would execute against org: $org_alias"
        
        # Optionally execute the test query
        read -p "Execute test query? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sf data query --query "$test_query" --target-org "$org_alias" 2>&1 | head -20
        fi
    else
        log_message WARNING "No org alias provided - cannot test execution"
    fi
    
    return 0
}

# Main function
main() {
    local query=""
    local query_file=""
    local object=""
    local org_alias=""
    local fix_errors="n"
    local check_perf=false
    local suggest=false
    local test_exec=false
    local VERBOSE=false
    
    # Parse arguments
    while getopts "q:f:o:a:x:pstvh" opt; do
        case $opt in
            q) query="$OPTARG";;
            f) query_file="$OPTARG";;
            o) object="$OPTARG";;
            a) org_alias="$OPTARG";;
            x) fix_errors="$OPTARG";;
            p) check_perf=true;;
            s) suggest=true;;
            t) test_exec=true;;
            v) VERBOSE=true;;
            h) usage;;
            *) usage;;
        esac
    done
    
    # Read query from file if specified
    if [[ -n "$query_file" ]]; then
        if [[ -f "$query_file" ]]; then
            query=$(cat "$query_file")
        else
            log_message ERROR "File not found: $query_file"
            exit 1
        fi
    fi
    
    # Validate query is provided
    if [[ -z "$query" ]]; then
        log_message ERROR "No query provided. Use -q or -f option."
        usage
    fi
    
    echo -e "${MAGENTA}╔══════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║         SOQL Query Validator v1.0        ║${NC}"
    echo -e "${MAGENTA}╚══════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${CYAN}Original Query:${NC}"
    echo "$query"
    echo ""
    
    # Step 1: Check for reserved keywords
    if ! check_reserved_keywords "$query"; then
        if [[ "$fix_errors" == "y" ]]; then
            fix_query "$query"
            # Update query with fixed version for further validation
            query=$(fix_query "$query" | grep -A1 "Fixed Query:" | tail -1)
        fi
    else
        log_message SUCCESS "No reserved keyword issues"
    fi
    
    # Step 2: Validate structure
    if validate_structure "$query"; then
        log_message SUCCESS "Query structure is valid"
    else
        if [[ "$fix_errors" == "y" ]]; then
            fix_query "$query"
        fi
    fi
    
    # Step 3: Check performance
    if [[ "$check_perf" == true ]]; then
        echo ""
        check_performance "$query"
    fi
    
    # Step 4: Suggest optimizations
    if [[ "$suggest" == true ]]; then
        echo ""
        suggest_optimizations "$query"
    fi
    
    # Step 5: Test execution
    if [[ "$test_exec" == true ]]; then
        echo ""
        test_execution "$query" "$org_alias"
    fi
    
    echo ""
    echo -e "${GREEN}Validation complete!${NC}"
}

# Run main function
main "$@"