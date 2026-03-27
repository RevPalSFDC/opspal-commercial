#!/usr/bin/env bash

set -euo pipefail

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
    local flow_dir="${3:-}"
    local required_types=("Renewal" "New Business" "Upsell" "Downgrade")
    local missing_types=()

    # Validate command inputs
    if [ -z "$org" ] || [ -z "$object" ];  then
        echo "❌ Error: Missing required parameters"
        echo "USAGE: $0 -o <org> -n <object> [--flow-dir <dir>]"
        exit $EXIT_CONFIG_ERROR
    fi

    echo "Checking flow consolidation coverage for $object in $org"

    if [ -n "$flow_dir" ] && [ -d "$flow_dir" ]; then
        for opportunity_type in "${required_types[@]}"; do
            if ! grep -Rqi -- "$opportunity_type" "$flow_dir"/*.flow-meta.xml 2>/dev/null; then
                missing_types+=("$opportunity_type")
            fi
        done

        if ! grep -RqiE 'subscription|interval' "$flow_dir"/*.flow-meta.xml 2>/dev/null; then
            echo "⚠️ No subscription interval stamping flows detected in $flow_dir"
            exit $EXIT_VALIDATION_ERROR
        fi
    fi

    if [ "${#missing_types[@]}" -gt 0 ]; then
        echo "⚠️ Missing subscription interval coverage for: ${missing_types[*]}"
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
        --flow-dir)
            FLOW_DIR="$2"
            shift
            shift
            ;;
        *)
            echo "Unknown parameter passed: $1"
            exit $EXIT_CONFIG_ERROR
            ;;
    esac
done

validate_flow_consolidation "$ORG" "$OBJECT" "${FLOW_DIR:-}"
