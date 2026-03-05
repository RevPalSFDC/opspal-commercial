#!/bin/bash
# soql-validator.sh - SOQL Query Validator and Sanitizer
# Validates queries and fixes common syntax issues before execution

# SOQL Reserved Keywords (comprehensive list)
declare -a RESERVED_KEYWORDS=(
    "ALL" "AND" "AS" "ASC" "BY" "CUBE" "COUNT" "DESC" "ELSE" "END"
    "EXCLUDES" "FALSE" "FIRST" "FOR" "FROM" "GROUP" "HAVING" "IN"
    "INCLUDES" "LAST" "LIKE" "LIMIT" "NOT" "NULL" "NULLS" "OR"
    "ORDER" "REFERENCE" "ROLLUP" "SELECT" "TRUE" "UPDATE" "USING"
    "VIEW" "WHERE" "WITH" "DATA" "CATEGORY" "YESTERDAY" "TODAY"
    "TOMORROW" "LAST_WEEK" "THIS_WEEK" "NEXT_WEEK" "LAST_MONTH"
    "THIS_MONTH" "NEXT_MONTH" "LAST_90_DAYS" "NEXT_90_DAYS"
    "THIS_QUARTER" "LAST_QUARTER" "NEXT_QUARTER" "THIS_YEAR"
    "LAST_YEAR" "NEXT_YEAR" "THIS_FISCAL_QUARTER" "LAST_FISCAL_QUARTER"
    "NEXT_FISCAL_QUARTER" "THIS_FISCAL_YEAR" "LAST_FISCAL_YEAR"
    "NEXT_FISCAL_YEAR" "DAY_IN_MONTH" "DAY_IN_WEEK" "DAY_IN_YEAR"
    "DAY_ONLY" "WEEK_IN_MONTH" "WEEK_IN_YEAR" "HOUR_IN_DAY"
    "CALENDAR_MONTH" "CALENDAR_QUARTER" "CALENDAR_YEAR"
    "FISCAL_MONTH" "FISCAL_QUARTER" "FISCAL_YEAR"
    # Common problematic aliases
    "COUNT" "SUM" "AVG" "MIN" "MAX" "DATE" "NAME" "TYPE"
    "STATUS" "VALUE" "KEY" "INDEX" "SIZE" "LENGTH" "FORMAT"
    "POSITION" "STATE" "LEVEL" "RANK" "SEQUENCE" "VERSION"
)

# Function to check if a word is reserved
is_reserved_keyword() {
    local word="${1^^}"  # Convert to uppercase
    for keyword in "${RESERVED_KEYWORDS[@]}"; do
        if [[ "$word" == "$keyword" ]]; then
            return 0
        fi
    done
    return 1
}

# Function to validate and fix aliases in SOQL query
validate_soql_aliases() {
    local query="$1"
    local errors=""
    local warnings=""
    local fixed_query="$query"

    # Extract aliases from query (basic pattern matching)
    # Matches patterns like: "COUNT(Id) Count" or "SUM(Amount) Sum"
    while IFS= read -r line; do
        if [[ "$line" =~ ([A-Z_]+\([^\)]+\))[[:space:]]+([A-Za-z_][A-Za-z0-9_]*) ]]; then
            local function_call="${BASH_REMATCH[1]}"
            local alias="${BASH_REMATCH[2]}"

            if is_reserved_keyword "$alias"; then
                errors="${errors}ERROR: Alias '${alias}' is a reserved keyword in '${function_call} ${alias}'\n"
                # Suggest fix by appending underscore
                local new_alias="${alias}_"
                fixed_query="${fixed_query//${function_call} ${alias}/${function_call} ${new_alias}}"
                warnings="${warnings}FIXED: Changed '${alias}' to '${new_alias}'\n"
            fi
        fi
    done <<< "$(echo "$query" | grep -oE '[A-Z_]+\([^\)]+\)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*')"

    # Check for other common issues

    # Issue 1: Missing FROM clause
    if ! echo "$query" | grep -qi "FROM"; then
        errors="${errors}ERROR: Missing FROM clause\n"
    fi

    # Issue 2: Unbalanced parentheses
    local open_parens=$(echo "$query" | tr -cd '(' | wc -c)
    local close_parens=$(echo "$query" | tr -cd ')' | wc -c)
    if [ "$open_parens" -ne "$close_parens" ]; then
        errors="${errors}ERROR: Unbalanced parentheses (${open_parens} open, ${close_parens} close)\n"
    fi

    # Issue 3: Check for proper field references (Object.Field or Object__r.Field)
    if echo "$query" | grep -qE '[A-Za-z]+_[A-Za-z]+\.[A-Za-z]+'; then
        warnings="${warnings}WARNING: Found underscore in object reference (should be Object__r.Field for relationships)\n"
    fi

    # Return results
    echo "=== SOQL Query Validation Results ==="
    if [ -n "$errors" ]; then
        echo -e "ERRORS FOUND:\n$errors"
    fi
    if [ -n "$warnings" ]; then
        echo -e "WARNINGS/FIXES:\n$warnings"
    fi
    if [ "$query" != "$fixed_query" ]; then
        echo "=== ORIGINAL QUERY ==="
        echo "$query"
        echo ""
        echo "=== SUGGESTED FIX ==="
        echo "$fixed_query"
    else
        echo "Query appears valid."
    fi

    # Return fixed query
    echo ""
    echo "=== VALIDATED QUERY ==="
    echo "$fixed_query"
}

# Function to execute SOQL with validation
execute_validated_soql() {
    local query="$1"
    local org="${2:-}"

    # Validate query first
    echo "Validating SOQL query..." >&2
    local validation_result=$(validate_soql_aliases "$query")

    # Extract the fixed query from validation result
    local fixed_query=$(echo "$validation_result" | sed -n '/=== VALIDATED QUERY ===/,$ p' | tail -n +2)

    # Show validation results
    echo "$validation_result" >&2

    # Ask for confirmation if query was modified
    if [ "$query" != "$fixed_query" ]; then
        echo "" >&2
        echo "Query has been modified to fix issues. Proceed with execution? (y/n)" >&2
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            echo "Query execution cancelled." >&2
            return 1
        fi
    fi

    # Execute the query using sf-wrapper
    local sf_wrapper="$(dirname "$0")/sf-wrapper.sh"
    if [ -f "$sf_wrapper" ]; then
        source "$sf_wrapper"
        if [ -n "$org" ]; then
            sf_exec data query --query "$fixed_query" --target-org "$org"
        else
            sf_exec data query --query "$fixed_query"
        fi
    else
        # Fallback to direct execution
        if [ -n "$org" ]; then
            sf data query --query "$fixed_query" --target-org "$org" 2>&1 | grep -v "Warning.*update available"
        else
            sf data query --query "$fixed_query" 2>&1 | grep -v "Warning.*update available"
        fi
    fi
}

# Main execution if called directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    if [ $# -eq 0 ]; then
        echo "Usage: $0 <query> [org-alias]"
        echo "       $0 --validate <query>"
        echo "       $0 --execute <query> [org-alias]"
        exit 1
    fi

    case "$1" in
        --validate)
            shift
            validate_soql_aliases "$1"
            ;;
        --execute)
            shift
            execute_validated_soql "$@"
            ;;
        *)
            # Default to validation
            validate_soql_aliases "$1"
            ;;
    esac
fi