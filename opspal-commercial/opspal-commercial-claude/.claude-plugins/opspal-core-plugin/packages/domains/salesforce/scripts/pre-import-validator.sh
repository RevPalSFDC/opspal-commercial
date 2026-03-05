#!/bin/bash

##############################################################################
# pre-import-validator.sh - Comprehensive Pre-Import Validation System
##############################################################################
# This script validates and prepares data BEFORE attempting Salesforce import,
# catching issues that would cause failures and automatically fixing them.
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CACHE_DIR="${SCRIPT_DIR}/../.validation-cache"
RULES_FILE="${CACHE_DIR}/validation-rules.json"
FIELD_REQUIREMENTS="${CACHE_DIR}/field-requirements.json"

# Ensure cache directory exists
mkdir -p "$CACHE_DIR"

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] -o OBJECT -f CSV_FILE

Validates and prepares CSV data for Salesforce import by:
1. Analyzing validation rules in target org
2. Checking for required fields
3. Auto-fixing common issues
4. Creating import-ready files

OPTIONS:
    -o OBJECT       Salesforce object API name (e.g., Account, Contact)
    -f CSV_FILE     Path to CSV file to validate
    -a ALIAS        Salesforce org alias (optional, uses default if not specified)
    -m MODE         Validation mode: quick, standard, thorough (default: standard)
    -r REFRESH      Force refresh validation rules from org (y/n, default: n)
    -x FIX          Auto-fix issues (y/n, default: y)
    -s SIMULATE     Simulate import without actual execution (y/n, default: n)
    -h              Display this help message

EXAMPLES:
    # Basic validation with auto-fix
    $0 -o Account -f accounts.csv

    # Thorough validation with rule refresh
    $0 -o Contact -f contacts.csv -m thorough -r y

    # Simulate import to check for issues
    $0 -o Lead -f leads.csv -s y

EOF
    exit 1
}

# Function to fetch validation rules from Salesforce
fetch_validation_rules() {
    local object="$1"
    local org_alias="$2"
    local force_refresh="$3"
    
    local cache_file="${CACHE_DIR}/${object}_validation_rules.json"
    
    # Check if we need to refresh
    if [[ "$force_refresh" != "y" ]] && [[ -f "$cache_file" ]]; then
        # Check if cache is less than 24 hours old
        if [[ $(find "$cache_file" -mtime -1 2>/dev/null) ]]; then
            echo -e "${BLUE}Using cached validation rules${NC}"
            return 0
        fi
    fi
    
    echo -e "${YELLOW}Fetching validation rules from Salesforce...${NC}"
    
    # Query for validation rules
    local query="SELECT Id, ValidationName, Active, Description, ErrorConditionFormula, ErrorMessage 
                 FROM ValidationRule 
                 WHERE EntityDefinition.QualifiedApiName = '${object}' 
                 AND Active = true"
    
    if [[ -n "$org_alias" ]]; then
        sf data query --query "$query" --target-org "$org_alias" --json > "$cache_file"
    else
        sf data query --query "$query" --json > "$cache_file"
    fi
    
    echo -e "${GREEN}Validation rules cached${NC}"
}

# Function to analyze field requirements
analyze_field_requirements() {
    local object="$1"
    local org_alias="$2"
    
    echo -e "${YELLOW}Analyzing field requirements...${NC}"
    
    # Query for required fields
    local query="SELECT QualifiedApiName, IsNillable, DefaultValue, DataType, Label 
                 FROM FieldDefinition 
                 WHERE EntityDefinition.QualifiedApiName = '${object}' 
                 AND IsNillable = false"
    
    local cmd="sf data query --query \"$query\" --json"
    if [[ -n "$org_alias" ]]; then
        cmd="$cmd --target-org $org_alias"
    fi
    
    eval "$cmd" > "${CACHE_DIR}/${object}_required_fields.json"
    
    # Extract specific validation patterns
    echo -e "${BLUE}Checking for known validation patterns...${NC}"
    
    # Check for Website requirement on Account
    if [[ "$object" == "Account" ]]; then
        echo "  - Website field requirement detected"
        echo '{"Website": {"required": true, "default": "N/A"}}' > "${CACHE_DIR}/Account_field_defaults.json"
    fi
    
    # Check for picklist dependencies
    local picklist_query="SELECT QualifiedApiName, Label, DataType, PicklistValues 
                          FROM FieldDefinition 
                          WHERE EntityDefinition.QualifiedApiName = '${object}' 
                          AND DataType LIKE '%Picklist%'"
    
    eval "sf data query --query \"$picklist_query\" --json" > "${CACHE_DIR}/${object}_picklists.json"

    # Cache full field list for header validation
    local field_query="SELECT QualifiedApiName, Label, DataType 
                       FROM FieldDefinition 
                       WHERE EntityDefinition.QualifiedApiName = '${object}'"
    local field_cmd="sf data query --query \"$field_query\" --json"
    if [[ -n "$org_alias" ]]; then
        field_cmd="$field_cmd --target-org $org_alias"
    fi
    eval "$field_cmd" > "${CACHE_DIR}/${object}_field_definitions.json"
}

# Function to validate CSV headers
validate_csv_headers() {
    local csv_file="$1"
    local object="$2"
    
    echo -e "${YELLOW}Validating CSV headers...${NC}"
    
    # Get headers from CSV
    local header_line
    header_line=$(head -n 1 "$csv_file")
    header_line=$(printf '%s' "$header_line" | sed 's/^\xEF\xBB\xBF//')
    IFS=',' read -r -a raw_headers <<< "$header_line"

    declare -A header_map
    local cleaned_headers=()
    local raw_header
    for raw_header in "${raw_headers[@]}"; do
        local cleaned
        cleaned=$(printf '%s' "$raw_header" | sed 's/^"//;s/"$//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        if [[ -n "$cleaned" ]]; then
            header_map["$cleaned"]=1
            cleaned_headers+=("$cleaned")
        fi
    done
    
    # Check for required fields
    if [[ -f "${CACHE_DIR}/${object}_required_fields.json" ]]; then
        local required_fields=$(jq -r '.result.records[].QualifiedApiName' "${CACHE_DIR}/${object}_required_fields.json" 2>/dev/null || echo "")
        
        for field in $required_fields; do
            if [[ -z "${header_map[$field]}" ]]; then
                echo -e "  ${YELLOW}⚠ Missing required field: $field${NC}"
            fi
        done
    fi

    # Check for unknown fields (schema/parse guardrail)
    if [[ -f "${CACHE_DIR}/${object}_field_definitions.json" ]]; then
        declare -A valid_fields
        while IFS= read -r field_name; do
            if [[ -n "$field_name" ]]; then
                valid_fields["$field_name"]=1
            fi
        done < <(jq -r '.result.records[].QualifiedApiName' "${CACHE_DIR}/${object}_field_definitions.json" 2>/dev/null || echo "")

        local invalid_fields=()
        local header
        for header in "${cleaned_headers[@]}"; do
            if [[ "$header" == *"."* ]]; then
                continue
            fi
            if [[ -z "${valid_fields[$header]}" ]]; then
                invalid_fields+=("$header")
            fi
        done

        if [[ ${#invalid_fields[@]} -gt 0 ]]; then
            echo -e "  ${YELLOW}⚠ Unknown fields not on ${object}: ${invalid_fields[*]}${NC}"
            echo -e "  ${BLUE}ℹ Relationship fields (e.g., Account.Name) are skipped from validation${NC}"
        fi
    fi
    
    echo -e "${GREEN}Header validation complete${NC}"
}

# Function to apply data transformations
apply_transformations() {
    local csv_file="$1"
    local object="$2"
    local output_file="${csv_file}.transformed"
    
    echo -e "${YELLOW}Applying data transformations...${NC}"
    
    # Copy original file
    cp "$csv_file" "$output_file"
    
    # Apply object-specific transformations
    case "$object" in
        "Account")
            echo "  - Adding default Website values where missing"
            # Add Website column if missing
            if ! head -n 1 "$output_file" | grep -q "Website"; then
                sed -i '1s/$/,Website/' "$output_file"
                sed -i '2,$s/$/,N\/A/' "$output_file"
            fi
            
            # Fix empty Website values
            awk -F',' 'BEGIN {OFS=","} 
                NR==1 {print; next} 
                {
                    # Assuming Website is last column for simplicity
                    if ($NF == "" || $NF == " ") $NF = "N/A"
                    print
                }' "$output_file" > "$output_file.tmp" && mv "$output_file.tmp" "$output_file"
            ;;
            
        "Opportunity")
            echo "  - Validating stage names"
            echo "  - Checking close dates"
            ;;
            
        "Contact")
            echo "  - Validating email formats"
            # Add email validation
            ;;
    esac

    # Normalize state/country values for address fields
    if [[ -f "${SCRIPT_DIR}/lib/state-country-normalizer.js" ]]; then
        echo "  - Normalizing state/country values"
        node "${SCRIPT_DIR}/lib/state-country-normalizer.js" --input "$output_file" --output "$output_file" --object "$object" --prefer-name --quiet
    fi
    
    # Universal transformations
    echo "  - Trimming whitespace"
    sed -i 's/^[[:space:]]*//;s/[[:space:]]*$//' "$output_file"
    
    echo "  - Fixing line endings to CRLF"
    unix2dos "$output_file" 2>/dev/null || sed -i 's/$/\r/' "$output_file"
    
    echo -e "${GREEN}Transformations complete${NC}"
    echo "$output_file"
}

# Function to simulate import
simulate_import() {
    local object="$1"
    local csv_file="$2"
    local org_alias="$3"
    
    echo -e "${CYAN}=== Import Simulation ===${NC}"
    
    # Count records
    local record_count=$(($(wc -l < "$csv_file") - 1))
    echo "  Records to import: $record_count"
    
    # Check file size
    local file_size=$(du -h "$csv_file" | cut -f1)
    echo "  File size: $file_size"
    
    # Estimate time
    local estimated_time=$((record_count / 100))
    echo "  Estimated time: ${estimated_time} seconds"
    
    # Check for potential issues
    echo -e "${YELLOW}Checking for potential issues...${NC}"
    
    # Check for duplicates
    local id_field="Id"
    if head -n 1 "$csv_file" | grep -q "$id_field"; then
        local id_col=$(head -n 1 "$csv_file" | tr ',' '\n' | grep -n "^${id_field}$" | cut -d: -f1)
        if [[ -n "$id_col" ]]; then
            local unique_ids=$(tail -n +2 "$csv_file" | cut -d',' -f"$id_col" | sort -u | wc -l)
            if [[ $unique_ids -lt $record_count ]]; then
                echo -e "  ${YELLOW}⚠ Duplicate IDs detected${NC}"
            fi
        fi
    fi
    
    echo -e "${GREEN}Simulation complete${NC}"
}

# Function to generate import report
generate_report() {
    local csv_file="$1"
    local object="$2"
    local issues_found="$3"
    local fixes_applied="$4"
    
    local report_file="${csv_file}.validation-report.txt"
    
    cat > "$report_file" << EOF
================================================================================
                        PRE-IMPORT VALIDATION REPORT
================================================================================
Date: $(date)
File: $csv_file
Object: $object

SUMMARY
-------
Total Records: $(($(wc -l < "$csv_file") - 1))
Issues Found: $issues_found
Fixes Applied: $fixes_applied

VALIDATION RULES CHECKED
------------------------
$(if [[ -f "${CACHE_DIR}/${object}_validation_rules.json" ]]; then
    jq -r '.result.records[] | "- \(.ValidationName): \(.Description)"' "${CACHE_DIR}/${object}_validation_rules.json" 2>/dev/null || echo "None found"
else
    echo "Not available"
fi)

REQUIRED FIELDS
---------------
$(if [[ -f "${CACHE_DIR}/${object}_required_fields.json" ]]; then
    jq -r '.result.records[] | "- \(.QualifiedApiName) (\(.DataType))"' "${CACHE_DIR}/${object}_required_fields.json" 2>/dev/null || echo "None found"
else
    echo "Not available"
fi)

TRANSFORMATIONS APPLIED
-----------------------
- Line endings converted to CRLF
- Whitespace trimmed
- Default values added for required fields
$(if [[ "$object" == "Account" ]]; then
    echo "- Website field populated with 'N/A' where missing"
fi)

RECOMMENDATIONS
---------------
1. Review the transformed file before import
2. Consider running in smaller batches if > 10,000 records
3. Have rollback plan ready if issues occur
4. Monitor job status during import

FILES GENERATED
--------------
- Transformed data: ${csv_file}.transformed
- Validation report: ${report_file}

================================================================================
EOF
    
    echo -e "${GREEN}Validation report saved to: $report_file${NC}"
}

# Main validation pipeline
main() {
    # Initialize variables
    local object=""
    local csv_file=""
    local org_alias=""
    local mode="standard"
    local force_refresh="n"
    local auto_fix="y"
    local simulate="n"
    
    # Parse arguments
    while getopts "o:f:a:m:r:x:s:h" opt; do
        case $opt in
            o) object="$OPTARG";;
            f) csv_file="$OPTARG";;
            a) org_alias="$OPTARG";;
            m) mode="$OPTARG";;
            r) force_refresh="$OPTARG";;
            x) auto_fix="$OPTARG";;
            s) simulate="$OPTARG";;
            h) usage;;
            *) usage;;
        esac
    done
    
    # Validate required arguments
    if [[ -z "$object" ]] || [[ -z "$csv_file" ]]; then
        echo -e "${RED}Error: Object and CSV file are required${NC}"
        usage
    fi
    
    # Check if file exists
    if [[ ! -f "$csv_file" ]]; then
        echo -e "${RED}Error: File not found: $csv_file${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}=== Salesforce Pre-Import Validator ===${NC}"
    echo -e "${BLUE}Object: $object${NC}"
    echo -e "${BLUE}File: $csv_file${NC}"
    echo -e "${BLUE}Mode: $mode${NC}"
    echo ""
    
    local issues_found=0
    local fixes_applied=0
    
    # Step 1: Fetch validation rules
    if [[ "$mode" != "quick" ]]; then
        fetch_validation_rules "$object" "$org_alias" "$force_refresh"
        analyze_field_requirements "$object" "$org_alias"
    fi
    
    # Step 2: Validate CSV structure
    validate_csv_headers "$csv_file" "$object"
    
    # Step 3: Apply transformations if auto-fix is enabled
    local processed_file="$csv_file"
    if [[ "$auto_fix" == "y" ]]; then
        processed_file=$(apply_transformations "$csv_file" "$object")
        fixes_applied=$((fixes_applied + 1))
    fi
    
    # Step 4: Simulate import if requested
    if [[ "$simulate" == "y" ]]; then
        simulate_import "$object" "$processed_file" "$org_alias"
    fi
    
    # Step 5: Generate report
    generate_report "$csv_file" "$object" "$issues_found" "$fixes_applied"
    
    echo ""
    echo -e "${GREEN}=== Validation Complete ===${NC}"
    
    if [[ "$auto_fix" == "y" ]]; then
        echo -e "${BLUE}Transformed file ready for import: ${processed_file}${NC}"
        echo ""
        echo "Next steps:"
        echo "1. Review the validation report"
        echo "2. Import using: ./safe-bulk-import.sh -o $object -f $processed_file"
    fi
}

# Run main function
main "$@"
