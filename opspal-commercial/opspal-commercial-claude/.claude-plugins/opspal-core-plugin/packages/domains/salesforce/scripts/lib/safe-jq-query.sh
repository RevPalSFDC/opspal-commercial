#!/bin/bash

# Safe JQ Query Utility
# Prevents "Cannot iterate over null" errors when processing Salesforce API responses

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Safe query execution with automatic null handling
safe_jq() {
    local json_input="$1"
    local jq_expression="$2"
    local default_value="${3:-[]}"

    # If no input, return default
    if [ -z "$json_input" ]; then
        echo "$default_value"
        return 1
    fi

    # Apply safe jq processing
    echo "$json_input" | jq "$jq_expression" 2>/dev/null || echo "$default_value"
}

# Safe Salesforce query with built-in null protection
safe_sf_query() {
    local query="$1"
    local org="${2:-$SF_TARGET_ORG}"
    local use_tooling="${3:-false}"

    local cmd="sf data query --query \"$query\" --target-org \"$org\" --json"
    if [ "$use_tooling" = "true" ]; then
        cmd="$cmd --use-tooling-api"
    fi

    # Execute query
    local result=$(eval "$cmd" 2>/dev/null)

    # Ensure safe structure
    if [ -z "$result" ]; then
        echo '{"success": false, "result": {"totalSize": 0, "records": []}}'
    else
        echo "$result" | jq '{
            success: (.success // false),
            result: {
                totalSize: (.result.totalSize // 0),
                records: (.result.records // [])
            }
        }'
    fi
}

# Extract records safely
get_records() {
    local json_input="$1"
    echo "$json_input" | jq '(.result.records // [])'
}

# Count records safely
count_records() {
    local json_input="$1"
    echo "$json_input" | jq '(.result.records // []) | length'
}

# Get field values safely
get_field_values() {
    local json_input="$1"
    local field_name="$2"

    echo "$json_input" | jq -r "[.result.records[]?.$field_name // empty] | unique[]"
}

# Check if query returned data
has_records() {
    local json_input="$1"
    local count=$(count_records "$json_input")

    if [ "$count" -gt 0 ]; then
        return 0
    else
        return 1
    fi
}

# Fix vulnerable jq pattern in a command
fix_jq_pattern() {
    local pattern="$1"

    # Apply common fixes
    local fixed="$pattern"
    fixed="${fixed//.result.records\[\]/.result.records[]?}"
    fixed="${fixed//.result.records |/(.result.records \/\/ []) |}"
    fixed="${fixed//\| length/| length // 0}"

    echo "$fixed"
}

# Validate JSON structure before processing
validate_json() {
    local json_input="$1"

    if [ -z "$json_input" ]; then
        echo -e "${RED}Error: Empty input${NC}" >&2
        return 1
    fi

    if ! echo "$json_input" | jq empty 2>/dev/null; then
        echo -e "${RED}Error: Invalid JSON${NC}" >&2
        return 1
    fi

    return 0
}

# Demo function showing safe patterns
demo_safe_patterns() {
    echo -e "${GREEN}=== Safe JQ Pattern Examples ===${NC}\n"

    # Test data
    local null_result='{"result": null}'
    local null_records='{"result": {"records": null}}'
    local empty_records='{"result": {"records": []}}'
    local valid_records='{"result": {"records": [{"Id": "001", "Name": "Test"}]}}'

    echo -e "${BLUE}Test 1: Handling null result${NC}"
    echo "Input: $null_result"
    echo -n "Safe extraction: "
    safe_jq "$null_result" '(.result.records // [])'
    echo

    echo -e "${BLUE}Test 2: Handling null records${NC}"
    echo "Input: $null_records"
    echo -n "Safe count: "
    count_records "$null_records"
    echo

    echo -e "${BLUE}Test 3: Handling empty records${NC}"
    echo "Input: $empty_records"
    echo -n "Has records? "
    if has_records "$empty_records"; then
        echo "Yes"
    else
        echo "No"
    fi
    echo

    echo -e "${BLUE}Test 4: Valid records${NC}"
    echo "Input: $valid_records"
    echo -n "Record count: "
    count_records "$valid_records"
    echo -n "IDs: "
    get_field_values "$valid_records" "Id"
    echo
}

# Scan file for vulnerable patterns
scan_file_for_vulnerabilities() {
    local file="$1"

    echo -e "${YELLOW}Scanning $file for vulnerable jq patterns...${NC}"

    local vulnerabilities=0

    # Check for unsafe patterns
    if grep -q '\.result\.records\[\]' "$file" 2>/dev/null; then
        echo -e "${RED}  ⚠ Found: .result.records[]${NC} (use .result.records[]? instead)"
        ((vulnerabilities++))
    fi

    if grep -q '\.result\.records |' "$file" 2>/dev/null; then
        echo -e "${RED}  ⚠ Found: .result.records |${NC} (use (.result.records // []) | instead)"
        ((vulnerabilities++))
    fi

    if grep -q 'jq.*\| *length[^)]' "$file" 2>/dev/null; then
        echo -e "${YELLOW}  ⚠ Check: | length${NC} (consider adding // 0 for safety)"
        ((vulnerabilities++))
    fi

    if [ $vulnerabilities -eq 0 ]; then
        echo -e "${GREEN}  ✓ No vulnerable patterns found${NC}"
    else
        echo -e "${RED}  Found $vulnerabilities potential issues${NC}"
    fi

    return $vulnerabilities
}

# Main function for CLI usage
main() {
    case "${1:-}" in
        demo)
            demo_safe_patterns
            ;;
        scan)
            if [ -z "$2" ]; then
                echo "Usage: $0 scan <file|directory>"
                exit 1
            fi
            if [ -f "$2" ]; then
                scan_file_for_vulnerabilities "$2"
            elif [ -d "$2" ]; then
                find "$2" -type f \( -name "*.sh" -o -name "*.bash" \) | while read -r file; do
                    scan_file_for_vulnerabilities "$file"
                done
            else
                echo "Error: $2 not found"
                exit 1
            fi
            ;;
        fix)
            if [ -z "$2" ]; then
                echo "Usage: $0 fix '<jq-pattern>'"
                exit 1
            fi
            fixed=$(fix_jq_pattern "$2")
            echo "Original: $2"
            echo "Fixed:    $fixed"
            ;;
        query)
            if [ -z "$2" ]; then
                echo "Usage: $0 query '<SOQL>' [org] [use-tooling:true/false]"
                exit 1
            fi
            result=$(safe_sf_query "$2" "$3" "$4")
            echo "$result" | jq '.'
            ;;
        *)
            echo "Safe JQ Query Utility"
            echo ""
            echo "Usage: $0 <command> [arguments]"
            echo ""
            echo "Commands:"
            echo "  demo           Show safe pattern examples"
            echo "  scan <path>    Scan file/directory for vulnerable patterns"
            echo "  fix <pattern>  Show fixed version of a jq pattern"
            echo "  query <SOQL>   Execute safe Salesforce query"
            echo ""
            echo "Functions available for sourcing:"
            echo "  safe_jq           - Safe jq execution with null handling"
            echo "  safe_sf_query     - Safe Salesforce query"
            echo "  get_records       - Extract records safely"
            echo "  count_records     - Count records safely"
            echo "  get_field_values  - Get unique field values safely"
            echo "  has_records       - Check if records exist"
            ;;
    esac
}

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi