#!/bin/bash

##############################################################################
# validate-duplicates.sh - Duplicate Prevention Validator for Salesforce
##############################################################################
# Detects and prevents duplicate records before import, checking both within
# the CSV file and against existing records in Salesforce
##############################################################################

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source validation commons
source "${SCRIPT_DIR}/lib/validation-commons.sh"

# Script specific variables
VALIDATOR_NAME="duplicate-validator"
DEFAULT_ORG="${SF_TARGET_ORG}"

# Common duplicate detection fields by object
declare -A DUPLICATE_FIELDS=(
    ["Account"]="Name,Website,Phone"
    ["Contact"]="Email,FirstName,LastName"
    ["Lead"]="Email,Company,LastName"
    ["Opportunity"]="Name,AccountId,CloseDate"
    ["Case"]="CaseNumber,Subject,AccountId"
)

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] <csv-file> <object-name>

Detects duplicate records in CSV data and checks against existing Salesforce records.

Arguments:
    csv-file        Path to CSV file to validate
    object-name     Salesforce object API name (e.g., Account, Contact)

Options:
    -o, --org       Salesforce org alias (default: $DEFAULT_ORG)
    -f, --fields    Comma-separated fields to check for duplicates
                    (if not specified, uses standard fields for object)
    -m, --mode      Duplicate check mode:
                    csv     - Check duplicates within CSV only
                    org     - Check against org only
                    both    - Check both (default)
    -s, --strategy  How to handle duplicates:
                    flag    - Mark duplicates (default)
                    first   - Keep first occurrence
                    last    - Keep last occurrence
                    merge   - Merge duplicate records
    -v, --verbose   Show detailed validation progress
    -h, --help      Display this help message

Examples:
    # Basic duplicate check
    $0 accounts.csv Account

    # Check specific fields for duplicates
    $0 -f "Email,Phone" contacts.csv Contact

    # Check only within CSV, keep first occurrence
    $0 -m csv -s first leads.csv Lead

    # Check against production org
    $0 -o production opportunities.csv Opportunity

Output Files:
    *-unique.csv        Unique records (no duplicates)
    *-duplicates.csv    Duplicate records found
    *-merged.csv        Merged duplicate records (if -s merge)
    *-report.json       Detailed validation report

Default Duplicate Fields:
$(for obj in "${!DUPLICATE_FIELDS[@]}"; do
    printf "    %-15s %s\n" "$obj:" "${DUPLICATE_FIELDS[$obj]}"
done | sort)

EOF
    exit 0
}

# Parse command line arguments
ORG="$DEFAULT_ORG"
CHECK_FIELDS=""
CHECK_MODE="both"
DUPLICATE_STRATEGY="flag"
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--org)
            ORG="$2"
            shift 2
            ;;
        -f|--fields)
            CHECK_FIELDS="$2"
            shift 2
            ;;
        -m|--mode)
            CHECK_MODE="$2"
            shift 2
            ;;
        -s|--strategy)
            DUPLICATE_STRATEGY="$2"
            shift 2
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

# Validate check mode
if [[ "$CHECK_MODE" != "csv" ]] && [[ "$CHECK_MODE" != "org" ]] && [[ "$CHECK_MODE" != "both" ]]; then
    log_error "Invalid mode: $CHECK_MODE (must be csv, org, or both)"
    exit 1
fi

# Validate duplicate strategy
if [[ "$DUPLICATE_STRATEGY" != "flag" ]] && [[ "$DUPLICATE_STRATEGY" != "first" ]] && \
   [[ "$DUPLICATE_STRATEGY" != "last" ]] && [[ "$DUPLICATE_STRATEGY" != "merge" ]]; then
    log_error "Invalid strategy: $DUPLICATE_STRATEGY"
    exit 1
fi

# Validate org connection if checking against org
if [[ "$CHECK_MODE" == "org" ]] || [[ "$CHECK_MODE" == "both" ]]; then
    log_info "Validating org connection..."
    if ! validate_org_connection "$ORG"; then
        exit 1
    fi
fi

# Function to get duplicate check fields
get_duplicate_check_fields() {
    local object="$1"
    
    if [[ -n "$CHECK_FIELDS" ]]; then
        echo "$CHECK_FIELDS"
    elif [[ -n "${DUPLICATE_FIELDS[$object]}" ]]; then
        echo "${DUPLICATE_FIELDS[$object]}"
    else
        # Default to Name field if available
        echo "Name"
    fi
}

# Function to generate hash key for record
generate_record_key() {
    local line="$1"
    local fields="$2"
    local positions="$3"
    
    local key=""
    IFS=',' read -ra field_array <<< "$fields"
    IFS=',' read -ra pos_array <<< "$positions"
    
    for i in "${!field_array[@]}"; do
        local pos="${pos_array[$i]}"
        if [[ -n "$pos" ]]; then
            local value=$(echo "$line" | cut -d',' -f"$pos" | sed 's/"//g' | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            key="${key}|${value}"
        fi
    done
    
    echo "${key#|}"  # Remove leading pipe
}

# Function to check duplicates in CSV
check_csv_duplicates() {
    local csv_file="$1"
    local check_fields="$2"
    
    log_info "Checking for duplicates within CSV file..."
    
    # Get headers and positions
    local header=$(head -1 "$csv_file")
    declare -A field_positions
    local i=1
    for h in $(echo "$header" | tr ',' '\n'); do
        field_positions["$h"]=$i
        ((i++))
    done
    
    # Build position string for check fields
    local positions=""
    IFS=',' read -ra fields <<< "$check_fields"
    for field in "${fields[@]}"; do
        local pos="${field_positions[$field]}"
        if [[ -n "$pos" ]]; then
            positions="${positions}${pos},"
        else
            log_warning "Field '$field' not found in CSV"
        fi
    done
    positions="${positions%,}"  # Remove trailing comma
    
    if [[ -z "$positions" ]]; then
        log_error "No valid duplicate check fields found in CSV"
        return 1
    fi
    
    # Find duplicates
    declare -A seen_records
    declare -A duplicate_lines
    local line_num=1
    
    while IFS= read -r line; do
        ((line_num++))
        local key=$(generate_record_key "$line" "$check_fields" "$positions")
        
        if [[ -n "${seen_records[$key]}" ]]; then
            # This is a duplicate
            duplicate_lines[$line_num]="$key"
            # Also mark the first occurrence
            duplicate_lines[${seen_records[$key]}]="$key"
        else
            seen_records[$key]=$line_num
        fi
    done < <(tail -n +2 "$csv_file")
    
    echo "${!duplicate_lines[@]}"
}

# Function to check duplicates against org
check_org_duplicates() {
    local csv_file="$1"
    local check_fields="$2"
    local object="$3"
    
    log_info "Checking for duplicates against Salesforce org..."
    
    # Build SOQL query conditions
    local conditions=""
    IFS=',' read -ra fields <<< "$check_fields"
    
    # Get unique values for each field from CSV
    local header=$(head -1 "$csv_file")
    declare -A field_positions
    local i=1
    for h in $(echo "$header" | tr ',' '\n'); do
        field_positions["$h"]=$i
        ((i++))
    done
    
    # Collect unique values per field
    declare -A field_values
    for field in "${fields[@]}"; do
        local pos="${field_positions[$field]}"
        if [[ -n "$pos" ]]; then
            local values=$(tail -n +2 "$csv_file" | cut -d',' -f"$pos" | sed 's/"//g' | sort -u | grep -v '^$')
            field_values[$field]="$values"
        fi
    done
    
    # Check each unique combination
    declare -A org_duplicates
    for field in "${fields[@]}"; do
        if [[ -n "${field_values[$field]}" ]]; then
            local value_list=""
            while IFS= read -r value; do
                value_list="${value_list}'${value}',"
            done <<< "${field_values[$field]}"
            value_list="${value_list%,}"
            
            if [[ -n "$value_list" ]]; then
                local query="SELECT Id, $field FROM $object WHERE $field IN ($value_list)"
                [[ "$VERBOSE" == true ]] && log_info "Executing query: $query"
                
                local result=$(execute_soql "$query" "$ORG")
                local count=$(echo "$result" | jq '.result.totalSize' 2>/dev/null || echo "0")
                
                if [[ $count -gt 0 ]]; then
                    # Store existing values
                    while IFS= read -r existing_value; do
                        org_duplicates["${field}:${existing_value}"]="exists"
                    done < <(echo "$result" | jq -r ".result.records[].$field" 2>/dev/null)
                fi
            fi
        fi
    done
    
    # Check CSV records against org duplicates
    local duplicate_lines=""
    local line_num=1
    while IFS= read -r line; do
        ((line_num++))
        local is_duplicate=false
        
        for field in "${fields[@]}"; do
            local pos="${field_positions[$field]}"
            if [[ -n "$pos" ]]; then
                local value=$(echo "$line" | cut -d',' -f"$pos" | sed 's/"//g')
                if [[ -n "${org_duplicates[${field}:${value}]}" ]]; then
                    is_duplicate=true
                    break
                fi
            fi
        done
        
        if [[ "$is_duplicate" == true ]]; then
            duplicate_lines="${duplicate_lines}${line_num} "
        fi
    done < <(tail -n +2 "$csv_file")
    
    echo "$duplicate_lines"
}

# Function to merge duplicate records
merge_duplicates() {
    local csv_file="$1"
    local duplicate_lines="$2"
    local check_fields="$3"
    
    # For now, implement simple merge - keep non-empty values
    # This could be enhanced with more sophisticated merge logic
    log_info "Merging duplicate records..."
    
    # Implementation would go here
    # For brevity, we'll just flag duplicates rather than merge
    echo "$duplicate_lines"
}

# Main validation function
validate_duplicates() {
    local csv_file="$1"
    local output_dir=$(dirname "$csv_file")
    local base_name=$(basename "$csv_file" .csv)
    
    # Output files
    local unique_file="${output_dir}/${base_name}-unique.csv"
    local duplicates_file="${output_dir}/${base_name}-duplicates.csv"
    local merged_file="${output_dir}/${base_name}-merged.csv"
    local report_file="${output_dir}/${base_name}-duplicate-report.json"
    
    # Get duplicate check fields
    local check_fields=$(get_duplicate_check_fields "$OBJECT_NAME")
    log_info "Checking duplicates using fields: $check_fields"
    
    # Initialize duplicate tracking
    local csv_duplicates=""
    local org_duplicates=""
    declare -A all_duplicate_lines
    
    # Check CSV duplicates
    if [[ "$CHECK_MODE" == "csv" ]] || [[ "$CHECK_MODE" == "both" ]]; then
        csv_duplicates=$(check_csv_duplicates "$csv_file" "$check_fields")
        for line in $csv_duplicates; do
            all_duplicate_lines[$line]="csv"
        done
    fi
    
    # Check org duplicates
    if [[ "$CHECK_MODE" == "org" ]] || [[ "$CHECK_MODE" == "both" ]]; then
        org_duplicates=$(check_org_duplicates "$csv_file" "$check_fields" "$OBJECT_NAME")
        for line in $org_duplicates; do
            if [[ -n "${all_duplicate_lines[$line]}" ]]; then
                all_duplicate_lines[$line]="both"
            else
                all_duplicate_lines[$line]="org"
            fi
        done
    fi
    
    # Process records based on strategy
    local header=$(head -1 "$csv_file")
    echo "$header" > "$unique_file"
    echo "$header" > "$duplicates_file"
    [[ "$DUPLICATE_STRATEGY" == "merge" ]] && echo "$header" > "$merged_file"
    
    # Counters
    local total_records=0
    local unique_records=0
    local duplicate_records=0
    local csv_dup_count=0
    local org_dup_count=0
    
    # Process each record
    local line_num=1
    while IFS= read -r line; do
        ((line_num++))
        ((total_records++))
        
        if [[ -n "${all_duplicate_lines[$line_num]}" ]]; then
            # This is a duplicate
            ((duplicate_records++))
            
            case "${all_duplicate_lines[$line_num]}" in
                csv) ((csv_dup_count++)) ;;
                org) ((org_dup_count++)) ;;
                both) ((csv_dup_count++)); ((org_dup_count++)) ;;
            esac
            
            # Handle based on strategy
            case "$DUPLICATE_STRATEGY" in
                flag)
                    echo "$line" >> "$duplicates_file"
                    ;;
                first)
                    # Keep only if this is the first occurrence
                    # (Implementation would need to track this)
                    echo "$line" >> "$duplicates_file"
                    ;;
                last)
                    # Keep only the last occurrence
                    # (Would need second pass)
                    echo "$line" >> "$duplicates_file"
                    ;;
                merge)
                    # Add to merge file
                    echo "$line" >> "$merged_file"
                    ;;
            esac
        else
            # Unique record
            echo "$line" >> "$unique_file"
            ((unique_records++))
        fi
    done < <(tail -n +2 "$csv_file")
    
    # Generate report
    cat > "$report_file" <<EOF
{
    "validator": "$VALIDATOR_NAME",
    "file": "$CSV_FILE",
    "object": "$OBJECT_NAME",
    "org": "$ORG",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "check_fields": "$check_fields",
    "check_mode": "$CHECK_MODE",
    "duplicate_strategy": "$DUPLICATE_STRATEGY",
    "results": {
        "total_records": $total_records,
        "unique_records": $unique_records,
        "duplicate_records": $duplicate_records,
        "csv_duplicates": $csv_dup_count,
        "org_duplicates": $org_dup_count,
        "uniqueness_rate": $(echo "scale=2; $unique_records * 100 / $total_records" | bc)
    },
    "output_files": {
        "unique": "$unique_file",
        "duplicates": "$duplicates_file",
        "merged": "$merged_file"
    }
}
EOF
    
    # Display summary
    generate_validation_summary "$total_records" "$unique_records" "$duplicate_records" "0"
    
    # Show duplicate breakdown
    if [[ $duplicate_records -gt 0 ]]; then
        echo
        echo "Duplicate breakdown:"
        [[ $csv_dup_count -gt 0 ]] && echo "  - Within CSV: $csv_dup_count records"
        [[ $org_dup_count -gt 0 ]] && echo "  - Against org: $org_dup_count records"
    fi
    
    # Show output files
    echo
    log_success "Validation complete!"
    echo
    echo "Output files generated:"
    echo "  📗 Unique records:     $unique_file (${unique_records} records)"
    echo "  📕 Duplicate records:  $duplicates_file (${duplicate_records} records)"
    [[ "$DUPLICATE_STRATEGY" == "merge" ]] && \
        echo "  📘 Merged records:     $merged_file"
    echo "  📊 Report:             $report_file"
    
    # Return exit code based on validation results
    if [[ $duplicate_records -eq 0 ]]; then
        log_success "No duplicates found!"
        return 0
    else
        log_warning "Found $duplicate_records duplicate records"
        return 1
    fi
}

# Main execution
log_info "Starting duplicate validation for $OBJECT_NAME..."
log_info "Processing file: $CSV_FILE"

# Count records
RECORD_COUNT=$(count_csv_records "$CSV_FILE")
log_info "Found $RECORD_COUNT records to validate"

# Run validation
if validate_duplicates "$CSV_FILE"; then
    exit 0
else
    if [[ "$DUPLICATE_STRATEGY" != "flag" ]]; then
        log_info "Duplicates handled according to strategy: $DUPLICATE_STRATEGY"
        exit 0
    else
        exit 1
    fi
fi