#!/bin/bash

##############################################################################
# validate-required.sh - Required Field Validator for Salesforce
##############################################################################
# Validates that all required fields are present and populated in CSV data,
# preventing REQUIRED_FIELD_MISSING errors during import
##############################################################################

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source validation commons
source "${SCRIPT_DIR}/lib/validation-commons.sh"

# Script specific variables
VALIDATOR_NAME="required-field-validator"
DEFAULT_ORG="${SF_TARGET_ORG}"

# Default values for common required fields
declare -A DEFAULT_VALUES=(
    ["Status"]="New"
    ["StageName"]="Prospecting"
    ["Type"]="Other"
    ["Priority"]="Medium"
    ["LeadSource"]="Other"
    ["Rating"]="Warm"
    ["Industry"]="Other"
    ["Country"]="United States"
    ["IsActive"]="true"
    ["Probability"]="10"
)

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] <csv-file> <object-name>

Validates that all required fields are present and populated in CSV data.

Arguments:
    csv-file        Path to CSV file to validate
    object-name     Salesforce object API name (e.g., Account, Contact)

Options:
    -o, --org       Salesforce org alias (default: $DEFAULT_ORG)
    -d, --defaults  Apply default values to missing required fields
    -c, --custom    Custom defaults file (JSON format)
    -s, --strict    Fail if any required field is missing (no defaults)
    -v, --verbose   Show detailed validation progress
    -h, --help      Display this help message

Examples:
    # Basic validation
    $0 accounts.csv Account

    # Apply default values for missing required fields
    $0 -d opportunities.csv Opportunity

    # Use custom defaults from file
    $0 -c defaults.json contacts.csv Contact

    # Strict mode - no defaults allowed
    $0 -s leads.csv Lead

Output Files:
    *-complete.csv      Records with all required fields
    *-incomplete.csv    Records missing required fields
    *-fixed.csv         Records with defaults applied (if -d used)
    *-report.json       Detailed validation report

Default Values:
    When -d is used, common required fields get these defaults:
$(for key in "${!DEFAULT_VALUES[@]}"; do
    printf "    %-15s %s\n" "$key:" "${DEFAULT_VALUES[$key]}"
done | sort)

EOF
    exit 0
}

# Parse command line arguments
ORG="$DEFAULT_ORG"
APPLY_DEFAULTS=false
CUSTOM_DEFAULTS=""
STRICT_MODE=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--org)
            ORG="$2"
            shift 2
            ;;
        -d|--defaults)
            APPLY_DEFAULTS=true
            shift
            ;;
        -c|--custom)
            CUSTOM_DEFAULTS="$2"
            APPLY_DEFAULTS=true
            shift 2
            ;;
        -s|--strict)
            STRICT_MODE=true
            APPLY_DEFAULTS=false
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

if [[ -n "$CUSTOM_DEFAULTS" ]] && [[ ! -f "$CUSTOM_DEFAULTS" ]]; then
    log_error "Custom defaults file not found: $CUSTOM_DEFAULTS"
    exit 1
fi

# Validate org connection
log_info "Validating org connection..."
if ! validate_org_connection "$ORG"; then
    exit 1
fi

# Function to load custom defaults
load_custom_defaults() {
    local defaults_file="$1"
    
    if [[ -f "$defaults_file" ]]; then
        while IFS=":" read -r field value; do
            field=$(echo "$field" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/"//g')
            value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/"//g' | sed 's/,$//')
            DEFAULT_VALUES["$field"]="$value"
        done < <(jq -r 'to_entries[] | "\(.key):\(.value)"' "$defaults_file")
        
        log_info "Loaded $(jq 'length' "$defaults_file") custom default values"
    fi
}

# Function to get default value for a field
get_default_value() {
    local field="$1"
    local field_type="$2"
    
    # Check if we have a custom default
    if [[ -n "${DEFAULT_VALUES[$field]}" ]]; then
        echo "${DEFAULT_VALUES[$field]}"
        return
    fi
    
    # Generate default based on field type
    case "$field_type" in
        string|picklist)
            echo "Unknown"
            ;;
        boolean)
            echo "false"
            ;;
        int|double|percent|currency)
            echo "0"
            ;;
        date)
            echo "$(date +%Y-%m-%d)"
            ;;
        datetime)
            echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
            ;;
        email)
            echo "unknown@example.com"
            ;;
        phone)
            echo "000-000-0000"
            ;;
        url)
            echo "https://example.com"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Function to validate required fields
validate_required_fields() {
    local csv_file="$1"
    local output_dir=$(dirname "$csv_file")
    local base_name=$(basename "$csv_file" .csv)
    
    # Output files
    local complete_file="${output_dir}/${base_name}-complete.csv"
    local incomplete_file="${output_dir}/${base_name}-incomplete.csv"
    local fixed_file="${output_dir}/${base_name}-fixed.csv"
    local report_file="${output_dir}/${base_name}-required-report.json"
    
    # Load custom defaults if provided
    if [[ -n "$CUSTOM_DEFAULTS" ]]; then
        load_custom_defaults "$CUSTOM_DEFAULTS"
    fi
    
    # Get required fields for the object
    log_info "Fetching required fields for $OBJECT_NAME..."
    local required_fields=($(get_required_fields "$OBJECT_NAME" "$ORG"))
    
    # Get field types
    declare -A field_types
    while IFS=: read -r field type; do
        field_types["$field"]="$type"
    done < <(get_field_types "$OBJECT_NAME" "$ORG")
    
    # Remove system fields that are auto-populated
    local system_fields=("Id" "CreatedDate" "CreatedById" "LastModifiedDate" "LastModifiedById" "SystemModstamp")
    local user_required_fields=()
    for field in "${required_fields[@]}"; do
        if [[ ! " ${system_fields[@]} " =~ " ${field} " ]]; then
            user_required_fields+=("$field")
        fi
    done
    
    if [[ ${#user_required_fields[@]} -eq 0 ]]; then
        log_warning "No user-editable required fields found for $OBJECT_NAME"
        cp "$csv_file" "$complete_file"
        log_success "All records validated (no required fields to check)"
        return 0
    fi
    
    log_info "Found ${#user_required_fields[@]} required fields: ${user_required_fields[*]}"
    
    # Get CSV headers
    local csv_headers=($(get_csv_headers "$csv_file"))
    local header=$(head -1 "$csv_file")
    
    # Check which required fields are missing from CSV
    local missing_from_csv=()
    for req_field in "${user_required_fields[@]}"; do
        if [[ ! " ${csv_headers[@]} " =~ " ${req_field} " ]]; then
            missing_from_csv+=("$req_field")
        fi
    done
    
    if [[ ${#missing_from_csv[@]} -gt 0 ]]; then
        log_warning "Required fields missing from CSV headers: ${missing_from_csv[*]}"
        
        if [[ "$STRICT_MODE" == true ]]; then
            log_error "Strict mode: Cannot proceed with missing required fields in CSV"
            exit 1
        fi
        
        if [[ "$APPLY_DEFAULTS" == true ]]; then
            # Add missing fields to header
            for field in "${missing_from_csv[@]}"; do
                header="${header},${field}"
            done
            log_info "Added ${#missing_from_csv[@]} missing required fields to header"
        fi
    fi
    
    # Write headers to output files
    echo "$header" > "$complete_file"
    echo "$header" > "$incomplete_file"
    [[ "$APPLY_DEFAULTS" == true ]] && echo "$header" > "$fixed_file"
    
    # Get field positions
    declare -A field_positions
    local i=1
    for h in $(echo "$header" | tr ',' '\n'); do
        field_positions["$h"]=$i
        ((i++))
    done
    
    # Validation counters
    local total_records=0
    local complete_records=0
    local incomplete_records=0
    local fixed_records=0
    declare -A missing_field_counts
    local record_errors=()
    
    # Process each record
    while IFS= read -r line; do
        ((total_records++))
        [[ "$VERBOSE" == true ]] && [[ $((total_records % 100)) -eq 0 ]] && \
            log_info "Processing record $total_records..."
        
        local is_complete=true
        local missing_fields=()
        local fixed_line="$line"
        
        # Check each required field
        for field in "${user_required_fields[@]}"; do
            local pos=${field_positions["$field"]}
            
            if [[ -z "$pos" ]]; then
                # Field not in original CSV
                if [[ "$APPLY_DEFAULTS" == true ]]; then
                    local default_val=$(get_default_value "$field" "${field_types[$field]}")
                    fixed_line="${fixed_line},${default_val}"
                else
                    is_complete=false
                    missing_fields+=("$field")
                fi
            else
                # Check if field has value
                local value=$(echo "$line" | cut -d',' -f"$pos" | sed 's/"//g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                
                if [[ -z "$value" ]]; then
                    is_complete=false
                    missing_fields+=("$field")
                    ((missing_field_counts["$field"]++))
                    
                    if [[ "$APPLY_DEFAULTS" == true ]]; then
                        local default_val=$(get_default_value "$field" "${field_types[$field]}")
                        # Replace empty value with default
                        fixed_line=$(echo "$fixed_line" | \
                            awk -F',' -v pos="$pos" -v val="$default_val" 'BEGIN{OFS=","} {$pos=val; print}')
                    fi
                fi
            fi
        done
        
        # Add default values for fields not in CSV
        if [[ "$APPLY_DEFAULTS" == true ]] && [[ ${#missing_from_csv[@]} -gt 0 ]]; then
            for field in "${missing_from_csv[@]}"; do
                if [[ ! " ${missing_fields[@]} " =~ " ${field} " ]]; then
                    # Already added in the fixed_line construction above
                    true
                fi
            done
        fi
        
        # Write to appropriate file
        if [[ "$is_complete" == true ]]; then
            echo "$line" >> "$complete_file"
            ((complete_records++))
        else
            echo "$line" >> "$incomplete_file"
            ((incomplete_records++))
            record_errors+=("Record $total_records missing: ${missing_fields[*]}")
            
            if [[ "$APPLY_DEFAULTS" == true ]]; then
                echo "$fixed_line" >> "$fixed_file"
                ((fixed_records++))
            fi
        fi
        
    done < <(tail -n +2 "$csv_file")
    
    # Generate field frequency report
    local field_freq_json=""
    for field in "${!missing_field_counts[@]}"; do
        field_freq_json="${field_freq_json}\"$field\": ${missing_field_counts[$field]},"
    done
    field_freq_json="{${field_freq_json%,}}"
    
    # Generate report
    cat > "$report_file" <<EOF
{
    "validator": "$VALIDATOR_NAME",
    "file": "$CSV_FILE",
    "object": "$OBJECT_NAME",
    "org": "$ORG",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "required_fields": [$(printf '"%s",' "${user_required_fields[@]}" | sed 's/,$//')]",
    "missing_from_csv": [$(printf '"%s",' "${missing_from_csv[@]}" | sed 's/,$//')]",
    "settings": {
        "apply_defaults": $([[ "$APPLY_DEFAULTS" == true ]] && echo "true" || echo "false"),
        "strict_mode": $([[ "$STRICT_MODE" == true ]] && echo "true" || echo "false"),
        "custom_defaults": "$CUSTOM_DEFAULTS"
    },
    "results": {
        "total_records": $total_records,
        "complete_records": $complete_records,
        "incomplete_records": $incomplete_records,
        "fixed_records": $fixed_records,
        "completeness_rate": $(echo "scale=2; $complete_records * 100 / $total_records" | bc)
    },
    "missing_field_frequency": $field_freq_json,
    "output_files": {
        "complete": "$complete_file",
        "incomplete": "$incomplete_file",
        "fixed": "$fixed_file"
    }
}
EOF
    
    # Display summary
    generate_validation_summary "$total_records" "$complete_records" "$incomplete_records" "$fixed_records"
    
    # Show missing field statistics
    if [[ ${#missing_field_counts[@]} -gt 0 ]]; then
        echo
        echo "Most frequently missing fields:"
        for field in "${!missing_field_counts[@]}"; do
            echo "  - $field: ${missing_field_counts[$field]} records"
        done | sort -t: -k2 -rn | head -5
    fi
    
    # Show output files
    echo
    log_success "Validation complete!"
    echo
    echo "Output files generated:"
    echo "  📗 Complete records:   $complete_file (${complete_records} records)"
    echo "  📕 Incomplete records: $incomplete_file (${incomplete_records} records)"
    [[ "$APPLY_DEFAULTS" == true ]] && \
        echo "  📘 Fixed records:      $fixed_file (${fixed_records} records)"
    echo "  📊 Report:             $report_file"
    
    # Return exit code based on validation results
    if [[ $incomplete_records -eq 0 ]]; then
        log_success "All records have required fields!"
        return 0
    else
        log_warning "Found $incomplete_records records missing required fields"
        return 1
    fi
}

# Main execution
log_info "Starting required field validation for $OBJECT_NAME..."
log_info "Processing file: $CSV_FILE"

# Count records
RECORD_COUNT=$(count_csv_records "$CSV_FILE")
log_info "Found $RECORD_COUNT records to validate"

# Run validation
if validate_required_fields "$CSV_FILE"; then
    exit 0
else
    if [[ "$APPLY_DEFAULTS" == true ]]; then
        log_info "Fixed file created with default values applied"
        exit 0
    else
        exit 1
    fi
fi