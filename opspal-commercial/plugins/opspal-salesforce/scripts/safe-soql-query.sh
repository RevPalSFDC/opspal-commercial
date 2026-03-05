#!/bin/bash

# Safe SOQL Query Executor
# Automatically fixes common SOQL errors before execution

set -e

# Default values
ALIAS="${SF_TARGET_ORG:-example-company-sandbox}"
FORMAT="json"
QUERY=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--alias)
            ALIAS="$2"
            shift 2
            ;;
        -f|--format)
            FORMAT="$2"
            shift 2
            ;;
        -q|--query)
            QUERY="$2"
            shift 2
            ;;
        *)
            QUERY="$1"
            shift
            ;;
    esac
done

if [ -z "$QUERY" ]; then
    echo "Usage: safe-soql-query.sh \"YOUR SOQL QUERY\""
    echo "       safe-soql-query.sh -q \"YOUR QUERY\" -a alias -f format"
    exit 1
fi

# Fix the query
FIXED_QUERY=$(node ${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}} "$QUERY")

# Show what was fixed (to stderr so it doesn't interfere with output)
if [ "$QUERY" != "$FIXED_QUERY" ]; then
    echo "Fixed query issues:" >&2
    echo "  Original: $QUERY" >&2
    echo "  Fixed:    $FIXED_QUERY" >&2
    echo "" >&2
fi

# Execute the fixed query
sf data query --query "$FIXED_QUERY" --target-org "$ALIAS" --result-format "$FORMAT"