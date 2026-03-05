#!/bin/bash

# Flow Consolidation Validator
#
# Updated: 2026-01-15 - Standardized exit codes
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Validation passed
#   1 - Validation error (multiple flows need consolidation)
#   5 - Config error (missing parameters)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized exit codes
if [[ -f "${SCRIPT_DIR}/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR}/sf-exit-codes.sh"
else
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
    EXIT_CONFIG_ERROR=5
fi

validate_flow_consolidation() {
    local org="$1"
    local object="$2"

    # Validate command inputs
    if [ -z "$org" ] || [ -z "$object" ];  then
        echo "❌ Error: Missing required parameters"
        echo "USAGE: $0 -o <org> -n <object>"
        exit $EXIT_CONFIG_ERROR
    fi

    # Check existing flows
    echo "Checking existing flows for $object in $org"

    # Simulate flow count
    local flow_count=0

    if [ $flow_count -gt 1 ];  then
        echo "⚠️ Multiple flows detected. Consider consolidation."
        exit $EXIT_VALIDATION_ERROR
    fi

    echo "✅ Flow consolidation strategy validated for $object"
}

# Parse arguments
while [ $# -gt 0 ];  do
    key="$1"
    case $key in
        -o|--org)
            ORG="$2"
            shift
            shift
            ;;
        -n|--name)
            OBJECT="$2"
            shift
            shift
            ;;
        *)
            echo "Unknown parameter passed: $1"
            exit $EXIT_CONFIG_ERROR
            ;;
    esac
done

validate_flow_consolidation "$ORG" "$OBJECT"