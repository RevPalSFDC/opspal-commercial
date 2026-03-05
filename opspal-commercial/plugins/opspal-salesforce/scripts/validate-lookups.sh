#!/bin/bash

##############################################################################
# validate-lookups.sh - Lookup Relationship Validator for Salesforce
##############################################################################
# Validates that all lookup field values reference existing records in the
# target org, preventing INVALID_CROSS_REFERENCE_KEY errors
##############################################################################

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source validation commons
source "${SCRIPT_DIR}/lib/validation-commons.sh"

# Script specific variables
VALIDATOR_NAME="lookup-validator"
DEFAULT_ORG="${SF_TARGET_ORG}"

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] <csv-file> <object-name>

Validates lookup relationships in CSV data before Salesforce import.

Arguments:
    csv-file        Path to CSV file to validate
    object-name     Salesforce object API name (e.g., Opportunity, Contact)

Options:
    -o, --org       Salesforce org alias (default: $DEFAULT_ORG)
    -f, --fields    Comma-separated list of lookup fields to check
                    (if not specified, auto-detects all lookup fields)
    -c, --cache     Use cached lookup data (faster for multiple runs)
    -x, --fix       Attempt to fix invalid lookups (remove or replace)
    -v, --verbose   Show detailed validation progress
    -h, --help      Display this help message

Examples:
    # Validate all lookups in Opportunity data
    $0 opportunities.csv Opportunity

    # Check specific lookup fields only
    $0 -f "AccountId,OwnerId" contacts.csv Contact

    # Use specific org and fix invalid lookups
    $0 -o production -x accounts.csv Account

Output Files:
    *-valid.csv     Records with all valid lookups
    *-invalid.csv   Records with invalid lookups
    *-fixed.csv     Records with lookups fixed/removed (if -x used)
    *-report.json   Detailed validation report

EOF
    exit 0
}

# Parse command line arguments
ORG="$DEFAULT_ORG"
LOOKUP_FIELDS=""
USE_CACHE=false
FIX_INVALID=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--org)
            ORG="$2"
            shift 2
            ;;
        -f|--fields)
            LOOKUP_FIELDS="$2"
            shift 2
            ;;
        -c|--cache)
            USE_CACHE=true
            shift
            ;;
        -x|--fix)
            FIX_INVALID=true
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

# Validate org connection
log_info "Validating org connection..."
if ! validate_org_connection "$ORG"; then
    exit 1
fi

# Function to get lookup fields for the object
get_lookup_fields_for_validation() {
    local object="$1"
    
    if [[ -n "$LOOKUP_FIELDS" ]]; then
        # Use user-specified fields
        echo "$LOOKUP_FIELDS" | tr ',' '\n'
    else
        # Auto-detect lookup fields
        log_info "Auto-detecting lookup fields for $object..."
        get_lookup_fields "$object" "$ORG"
    fi
}

# Function to build lookup cache
build_lookup_cache() {
    local field="$1"
    local csv_file="$2"
    
    # Extract referenced object from field name
    local ref_object=""
    case "$field" in
        AccountId) ref_object="Account" ;;
        ContactId) ref_object="Contact" ;;
        OwnerId) ref_object="User" ;;
        ParentId) ref_object="$OBJECT_NAME" ;;  # Self-reference
        *Id) 
            # Try to derive object name (remove 'Id' suffix)
            ref_object="${field%Id}"
            ;;
        *)
            # For custom lookups, query the field metadata
            local field_info=$(get_object_metadata "$OBJECT_NAME" "$ORG" | \
                jq -r ".result.fields[] | select(.name == \"$field\") | .referenceTo[0]")
            ref_object="$field_info"
            ;;
    esac
    
    if [[ -z "$ref_object" ]]; then
        log_warning "Cannot determine reference object for field: $field"
        return 1
    fi
    
    # Get unique IDs from CSV
    local unique_ids=$(tail -n +2 "$csv_file" | \
        cut -d',' -f$(head -1 "$csv_file" | tr ',' '\n' | grep -n "^$field$" | cut -d: -f1) | \
        sort -u | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
    
    if [[ -z "$unique_ids" ]]; then
        log_info "No values found for field: $field"
        return 0
    fi
    
    # Build SOQL query to check if IDs exist
    local id_list=$(echo "$unique_ids" | sed "s/,/','/g" | sed "s/^/'/" | sed "s/$/'/")
    local query="SELECT Id FROM $ref_object WHERE Id IN ($id_list)"
    
    [[ "$VERBOSE" == true ]] && log_info "Checking ${ref_object} IDs..."
    
    # Execute query and cache results
    local cache_file="${CACHE_DIR}/lookup_${OBJECT_NAME}_${field}_${ref_object}.json"
    
    if [[ "$USE_CACHE" == true ]] && is_cache_valid "$cache_file" 7200; then
        log_info "Using cached lookup data for $field"
        cat "$cache_file"
    else
        local result=$(execute_soql "$query" "$ORG")
        echo "$result" > "$cache_file"
        echo "$result"
    fi
}

# Function to validate lookups in CSV
validate_lookups() {
    local csv_file="$1"
    local output_dir=$(dirname "$csv_file")
    local base_name=$(basename "$csv_file" .csv)
    
    # Output files
    local valid_file="${output_dir}/${base_name}-valid.csv"
    local invalid_file="${output_dir}/${base_name}-invalid.csv"
    local fixed_file="${output_dir}/${base_name}-fixed.csv"
    local report_file="${output_dir}/${base_name}-lookup-report.json"
    
    # Get lookup fields
    local lookup_fields=($(get_lookup_fields_for_validation "$OBJECT_NAME"))
    
    if [[ ${#lookup_fields[@]} -eq 0 ]]; then
        log_warning "No lookup fields found for $OBJECT_NAME"
        cp "$csv_file" "$valid_file"
        log_success "All records validated (no lookups to check)"
        return 0
    fi
    
    log_info "Found ${#lookup_fields[@]} lookup fields to validate: ${lookup_fields[*]}"
    
    # Build lookup caches for each field
    declare -A valid_ids
    for field in "${lookup_fields[@]}"; do
        log_info "Building lookup cache for $field..."
        local cache_result=$(build_lookup_cache "$field" "$csv_file")
        
        # Extract valid IDs from result
        if [[ -n "$cache_result" ]]; then
            local ids=$(echo "$cache_result" | jq -r '.result.records[].Id' 2>/dev/null | tr '\n' ' ')
            valid_ids["$field"]="$ids"
        fi
    done
    
    # Process CSV line by line
    local header=$(head -1 "$csv_file")
    echo "$header" > "$valid_file"
    echo "$header" > "$invalid_file"
    [[ "$FIX_INVALID" == true ]] && echo "$header" > "$fixed_file"
    
    # Get field positions
    declare -A field_positions
    local i=1
    for h in $(echo "$header" | tr ',' '\n'); do
        field_positions["$h"]=$i
        ((i++))
    done
    
    # Validation counters
    local total_records=0
    local valid_records=0
    local invalid_records=0
    local fixed_records=0
    local field_errors=()
    
    # Process each record
    while IFS= read -r line; do
        ((total_records++))
        [[ "$VERBOSE" == true ]] && [[ $((total_records % 100)) -eq 0 ]] && \
            log_info "Processing record $total_records..."
        
        local is_valid=true
        local invalid_fields=()
        local fixed_line="$line"
        
        # Check each lookup field
        for field in "${lookup_fields[@]}"; do
            local pos=${field_positions["$field"]}
            if [[ -n "$pos" ]]; then
                local value=$(echo "$line" | cut -d',' -f"$pos" | sed 's/"//g')
                
                if [[ -n "$value" ]]; then
                    # Check if ID is valid
                    if ! is_valid_salesforce_id "$value"; then
                        is_valid=false
                        invalid_fields+=("$field:invalid_format")
                    elif [[ -n "${valid_ids[$field]}" ]]; then
                        if ! echo "${valid_ids[$field]}" | grep -q "$value"; then
                            is_valid=false
                            invalid_fields+=("$field:not_found")
                        fi
                    fi
                    
                    # Fix if requested
                    if [[ "$FIX_INVALID" == true ]] && [[ "$is_valid" == false ]]; then
                        # Remove invalid lookup (set to empty)
                        fixed_line=$(echo "$fixed_line" | \
                            awk -F',' -v pos="$pos" 'BEGIN{OFS=","} {$pos=""; print}')
                    fi
                fi
            fi
        done
        
        # Write to appropriate file
        if [[ "$is_valid" == true ]]; then
            echo "$line" >> "$valid_file"
            ((valid_records++))
        else
            echo "$line" >> "$invalid_file"
            ((invalid_records++))
            field_errors+=("Record $total_records: ${invalid_fields[*]}")
            
            if [[ "$FIX_INVALID" == true ]]; then
                echo "$fixed_line" >> "$fixed_file"
                ((fixed_records++))
            fi
        fi
        
    done < <(tail -n +2 "$csv_file")
    
    # Generate report
    local error_details=$(printf '"%s",' "${field_errors[@]}" | sed 's/,$//')
    
    cat > "$report_file" <<EOF
{
    "validator": "$VALIDATOR_NAME",
    "file": "$CSV_FILE",
    "object": "$OBJECT_NAME",
    "org": "$ORG",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "lookup_fields": [$(printf '"%s",' "${lookup_fields[@]}" | sed 's/,$//')]",
    "results": {
        "total_records": $total_records,
        "valid_records": $valid_records,
        "invalid_records": $invalid_records,
        "fixed_records": $fixed_records,
        "pass_rate": $(echo "scale=2; $valid_records * 100 / $total_records" | bc)
    },
    "errors": [$error_details],
    "output_files": {
        "valid": "$valid_file",
        "invalid": "$invalid_file",
        "fixed": "$fixed_file"
    }
}
EOF
    
    # Display summary
    generate_validation_summary "$total_records" "$valid_records" "$invalid_records" "$fixed_records"
    
    # Show output files
    echo
    log_success "Validation complete!"
    echo
    echo "Output files generated:"
    echo "  📗 Valid records:   $valid_file (${valid_records} records)"
    echo "  📕 Invalid records: $invalid_file (${invalid_records} records)"
    [[ "$FIX_INVALID" == true ]] && \
        echo "  📘 Fixed records:   $fixed_file (${fixed_records} records)"
    echo "  📊 Report:          $report_file"
    
    # Return exit code based on validation results
    if [[ $invalid_records -eq 0 ]]; then
        log_success "All lookups are valid!"
        return 0
    else
        log_warning "Found $invalid_records records with invalid lookups"
        return 1
    fi
}

# Main execution
log_info "Starting lookup validation for $OBJECT_NAME..."
log_info "Processing file: $CSV_FILE"

# Count records
RECORD_COUNT=$(count_csv_records "$CSV_FILE")
log_info "Found $RECORD_COUNT records to validate"

# Run validation
if validate_lookups "$CSV_FILE"; then
    exit 0
else
    exit 1
fi