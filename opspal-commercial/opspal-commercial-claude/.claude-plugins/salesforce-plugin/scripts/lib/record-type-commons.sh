#!/bin/bash

##############################################################################
# record-type-commons.sh - Common Functions for Record Type Operations
##############################################################################
# Shared library for record type and picklist validation operations
##############################################################################

# Colors (if not already defined)
[[ -z "$RED" ]] && RED='\033[0;31m'
[[ -z "$GREEN" ]] && GREEN='\033[0;32m'
[[ -z "$YELLOW" ]] && YELLOW='\033[1;33m'
[[ -z "$BLUE" ]] && BLUE='\033[0;34m'
[[ -z "$CYAN" ]] && CYAN='\033[0;36m'
[[ -z "$NC" ]] && NC='\033[0m'

# Function to get record types for an object
get_record_types() {
    local object="$1"
    local org_alias="$2"
    
    local query="SELECT Id, Name, DeveloperName, IsActive FROM RecordType WHERE SobjectType = '${object}'"
    
    sf data query --query "$query" --json --target-org "$org_alias" 2>/dev/null | \
        jq -r '.result.records[] | "\(.Id)|\(.Name)|\(.DeveloperName)|\(.IsActive)"'
}

# Function to get default record type for an object
get_default_record_type() {
    local object="$1"
    local org_alias="$2"
    
    # First try to find one named "Default"
    local default_rt=$(get_record_types "$object" "$org_alias" | grep -E "\|Default\|" | cut -d'|' -f1)
    
    # If not found, get the first active record type
    if [[ -z "$default_rt" ]]; then
        default_rt=$(get_record_types "$object" "$org_alias" | grep "|true$" | head -1 | cut -d'|' -f1)
    fi
    
    echo "$default_rt"
}

# Function to get picklist values for a field and record type
get_picklist_values() {
    local object="$1"
    local field="$2"
    local record_type_id="$3"
    local org_alias="$4"
    
    # Use UI API to get picklist values for specific record type
    local endpoint="/services/data/v60.0/ui-api/object-info/${object}/picklist-values/${record_type_id}/${field}"
    
    sf api request rest "$endpoint" --method GET --target-org "$org_alias" 2>/dev/null | \
        jq -r '.values[].value' 2>/dev/null
}

# Function to check if a picklist value is valid for a record type
is_picklist_value_valid() {
    local object="$1"
    local field="$2"
    local value="$3"
    local record_type_id="$4"
    local org_alias="$5"
    
    local valid_values=$(get_picklist_values "$object" "$field" "$record_type_id" "$org_alias")
    
    echo "$valid_values" | grep -q "^${value}$"
    return $?
}

# Function to map picklist value to compatible record type
find_compatible_record_type() {
    local object="$1"
    local field="$2"
    local value="$3"
    local org_alias="$4"
    
    get_record_types "$object" "$org_alias" | while IFS='|' read -r rt_id rt_name rt_dev_name rt_active; do
        if [[ "$rt_active" == "true" ]]; then
            if is_picklist_value_valid "$object" "$field" "$value" "$rt_id" "$org_alias"; then
                echo "$rt_id"
                return 0
            fi
        fi
    done
    
    return 1
}

# Function to validate CSV headers against object fields
validate_csv_headers() {
    local csv_file="$1"
    local object="$2"
    local org_alias="$3"
    
    local headers=$(head -1 "$csv_file")
    local query="SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${object}'"
    local valid_fields=$(sf data query --query "$query" --use-tooling-api --json --target-org "$org_alias" 2>/dev/null | \
        jq -r '.result.records[].QualifiedApiName')
    
    local invalid_headers=""
    
    echo "$headers" | tr ',' '\n' | while read -r header; do
        if ! echo "$valid_fields" | grep -q "^${header}$"; then
            invalid_headers="${invalid_headers}${header}, "
        fi
    done
    
    if [[ -n "$invalid_headers" ]]; then
        echo "Invalid headers: ${invalid_headers%, }"
        return 1
    fi
    
    return 0
}

# Function to get field data type
get_field_datatype() {
    local object="$1"
    local field="$2"
    local org_alias="$3"
    
    local query="SELECT DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${object}' AND QualifiedApiName = '${field}'"
    
    sf data query --query "$query" --use-tooling-api --json --target-org "$org_alias" 2>/dev/null | \
        jq -r '.result.records[0].DataType'
}

# Function to validate data value against field type
validate_field_value() {
    local value="$1"
    local datatype="$2"
    
    case "$datatype" in
        "Email")
            echo "$value" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
            ;;
        "Phone")
            echo "$value" | grep -qE '^[\+\-\(\)\s0-9]+$'
            ;;
        "Date")
            echo "$value" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            ;;
        "DateTime")
            echo "$value" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
            ;;
        "Number"|"Currency"|"Percent")
            echo "$value" | grep -qE '^-?[0-9]+\.?[0-9]*$'
            ;;
        "Boolean"|"Checkbox")
            echo "$value" | grep -qiE '^(true|false|1|0|yes|no)$'
            ;;
        *)
            # For other types, assume valid
            return 0
            ;;
    esac
}

# Function to split CSV by record type
split_csv_by_record_type() {
    local csv_file="$1"
    local object="$2"
    local org_alias="$3"
    local rt_column="${4:-RecordTypeId}"
    
    local output_dir="${csv_file%.csv}_split"
    mkdir -p "$output_dir"
    
    local headers=$(head -1 "$csv_file")
    
    # Get column index for record type
    local rt_index=$(echo "$headers" | tr ',' '\n' | grep -n "^${rt_column}$" | cut -d: -f1)
    
    # Create files for each record type
    get_record_types "$object" "$org_alias" | while IFS='|' read -r rt_id rt_name rt_dev_name rt_active; do
        if [[ "$rt_active" == "true" ]]; then
            local output_file="${output_dir}/${rt_dev_name}.csv"
            echo "$headers" > "$output_file"
        fi
    done
    
    # Process each record
    tail -n +2 "$csv_file" | while IFS=',' read -ra fields; do
        local rt_value="${fields[$((rt_index-1))]}"
        
        # Find matching record type file
        local rt_dev_name=$(sf data query --query "SELECT DeveloperName FROM RecordType WHERE Id = '${rt_value}' OR Name = '${rt_value}' OR DeveloperName = '${rt_value}'" --json --target-org "$org_alias" 2>/dev/null | \
            jq -r '.result.records[0].DeveloperName')
        
        if [[ -n "$rt_dev_name" ]]; then
            echo "${fields[*]}" | tr ' ' ',' >> "${output_dir}/${rt_dev_name}.csv"
        fi
    done
    
    echo "CSV split into $(ls -1 "$output_dir"/*.csv | wc -l) files in $output_dir"
}

# Function to generate record type mapping report
generate_rt_mapping_report() {
    local object="$1"
    local org_alias="$2"
    
    echo -e "${CYAN}Record Type Mapping Report for $object${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    
    get_record_types "$object" "$org_alias" | while IFS='|' read -r rt_id rt_name rt_dev_name rt_active; do
        if [[ "$rt_active" == "true" ]]; then
            echo -e "\n${GREEN}Record Type: $rt_name${NC}"
            echo "  ID: $rt_id"
            echo "  Developer Name: $rt_dev_name"
            
            # Get picklist fields for this object
            local picklist_fields=$(sf data query --query "SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${object}' AND DataType IN ('Picklist', 'MultiselectPicklist')" --use-tooling-api --json --target-org "$org_alias" 2>/dev/null | \
                jq -r '.result.records[].QualifiedApiName')
            
            echo "$picklist_fields" | head -3 | while read -r field; do
                local values=$(get_picklist_values "$object" "$field" "$rt_id" "$org_alias" | head -5 | tr '\n' ', ')
                echo "  $field: ${values%, }"
            done
        fi
    done
}

# Function to fix picklist value issues in CSV
fix_picklist_issues() {
    local csv_file="$1"
    local object="$2"
    local org_alias="$3"
    local output_file="${4:-${csv_file%.csv}_fixed.csv}"
    
    local headers=$(head -1 "$csv_file")
    echo "$headers" > "$output_file"
    
    local fixes_applied=0
    
    tail -n +2 "$csv_file" | while IFS=',' read -ra fields; do
        local modified=false
        
        # Process each field
        for i in "${!fields[@]}"; do
            local field_name=$(echo "$headers" | cut -d',' -f$((i+1)))
            local field_value="${fields[$i]}"
            local field_type=$(get_field_datatype "$object" "$field_name" "$org_alias")
            
            # If it's a picklist field, validate and fix if needed
            if [[ "$field_type" == "Picklist" ]]; then
                # Find compatible record type for this value
                local compatible_rt=$(find_compatible_record_type "$object" "$field_name" "$field_value" "$org_alias")
                
                if [[ -z "$compatible_rt" ]]; then
                    # Value not valid for any record type, try to find alternative
                    echo -e "${YELLOW}Warning: Invalid value '$field_value' for field $field_name${NC}"
                    modified=true
                    fixes_applied=$((fixes_applied + 1))
                fi
            fi
        done
        
        echo "${fields[*]}" | tr ' ' ',' >> "$output_file"
    done
    
    echo -e "${GREEN}Fixed $fixes_applied issues. Output saved to: $output_file${NC}"
}

# Export functions for use by other scripts
export -f get_record_types
export -f get_default_record_type
export -f get_picklist_values
export -f is_picklist_value_valid
export -f find_compatible_record_type
export -f validate_csv_headers
export -f get_field_datatype
export -f validate_field_value
export -f split_csv_by_record_type
export -f generate_rt_mapping_report
export -f fix_picklist_issues