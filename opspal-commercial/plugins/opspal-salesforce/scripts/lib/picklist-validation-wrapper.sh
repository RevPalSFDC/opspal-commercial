#!/bin/bash

# Picklist Validation Wrapper for Salesforce Agents
# Provides easy integration of picklist validation into agent workflows

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
VALIDATOR_SCRIPT="${PROJECT_ROOT}/scripts/validate-picklists.sh"

# Function to validate CSV before import
validate_before_import() {
    local csv_file="$1"
    local object_name="$2"
    local org="${3:-$SF_TARGET_ORG}"
    
    echo "🔍 Running pre-import validation for $object_name..."
    
    # Run validation
    if "$VALIDATOR_SCRIPT" -o "$org" "$csv_file" "$object_name" > ${TEMP_DIR:-/tmp} 2>&1; then
        echo "✅ Validation passed - no picklist errors detected"
        return 0
    else
        # Parse validation output
        local error_count=$(grep -o "Found [0-9]* validation errors" ${TEMP_DIR:-/tmp} | grep -o "[0-9]*" || echo "0")
        
        if [[ "$error_count" -gt 0 ]]; then
            echo "⚠️  Found $error_count picklist restriction errors"
            
            # Get file paths
            local base_name=$(basename "$csv_file" .csv)
            local dir_name=$(dirname "$csv_file")
            local clean_file="${dir_name}/${base_name}-clean.csv"
            local error_file="${dir_name}/${base_name}-errors.csv"
            local fixed_file="${dir_name}/${base_name}-fixed.csv"
            
            # Return file paths in JSON format for agent processing
            cat <<EOF
{
    "status": "error",
    "error_count": $error_count,
    "original_file": "$csv_file",
    "clean_file": "$clean_file",
    "error_file": "$error_file",
    "fixed_file": "$fixed_file",
    "message": "Picklist validation failed. Clean records available for import."
}
EOF
            return 1
        fi
    fi
    
    return 0
}

# Function to auto-fix and retry import
auto_fix_and_retry() {
    local csv_file="$1"
    local object_name="$2"
    local org="${3:-$SF_TARGET_ORG}"
    
    echo "🔧 Attempting auto-fix for picklist errors..."
    
    # First validate to generate fixed file
    "$VALIDATOR_SCRIPT" -o "$org" "$csv_file" "$object_name" > /dev/null 2>&1 || true
    
    local base_name=$(basename "$csv_file" .csv)
    local dir_name=$(dirname "$csv_file")
    local fixed_file="${dir_name}/${base_name}-fixed.csv"
    
    if [[ -f "$fixed_file" ]]; then
        echo "✅ Fixed file generated: $fixed_file"
        
        # Validate the fixed file
        if validate_before_import "$fixed_file" "$object_name" "$org"; then
            echo "✅ Fixed file passes validation"
            echo "$fixed_file"
            return 0
        else
            echo "❌ Fixed file still has errors"
            return 1
        fi
    else
        echo "❌ No fixed file generated"
        return 1
    fi
}

# Function to get validation summary
get_validation_summary() {
    local csv_file="$1"
    local object_name="$2"
    local org="${3:-$SF_TARGET_ORG}"
    
    # Run validation and capture output
    local output=$("$VALIDATOR_SCRIPT" -o "$org" "$csv_file" "$object_name" 2>&1 || true)
    
    # Extract key metrics
    local total_records=$(echo "$output" | grep "Total records:" | grep -o "[0-9]*" || echo "0")
    local error_count=$(echo "$output" | grep "Found [0-9]* validation errors" | grep -o "[0-9]*" || echo "0")
    local clean_records=$((total_records - error_count))
    
    # Return summary in JSON
    cat <<EOF
{
    "total_records": $total_records,
    "error_records": $error_count,
    "clean_records": $clean_records,
    "success_rate": $(echo "scale=2; $clean_records * 100 / $total_records" | bc || echo "0")
}
EOF
}

# Export functions for use by other scripts
export -f validate_before_import
export -f auto_fix_and_retry
export -f get_validation_summary

# If called directly, show usage
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Picklist Validation Wrapper"
    echo "Usage: source $0"
    echo ""
    echo "Available functions:"
    echo "  validate_before_import <csv_file> <object_name> [org]"
    echo "  auto_fix_and_retry <csv_file> <object_name> [org]"
    echo "  get_validation_summary <csv_file> <object_name> [org]"
fi