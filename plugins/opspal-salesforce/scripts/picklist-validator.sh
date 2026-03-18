#!/bin/bash

# Picklist Value Validator with Record Type Awareness
# Validates picklist values against specific record types

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CACHE_DIR="$PROJECT_ROOT/data/picklist-metadata"
LOG_FILE="$PROJECT_ROOT/logs/picklist-validator.log"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$CACHE_DIR" "$(dirname "$LOG_FILE")"

# Load environment
source "$PROJECT_ROOT/.env" 2>/dev/null || true

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Function to fetch record types for an object
fetch_record_types() {
    local object_name="$1"
    local cache_file="$CACHE_DIR/${object_name}_recordtypes.json"
    
    echo -e "${BLUE}↻ Fetching record types for $object_name...${NC}"
    
    local query="SELECT Id, Name, DeveloperName, IsActive, Description FROM RecordType WHERE SobjectType='$object_name'"
    local result=$(sf data query --query "$query" --json 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "$result" | jq '.result.records' > "$cache_file"
        local count=$(jq '. | length' "$cache_file")
        echo -e "${GREEN}✓ Found $count record types for $object_name${NC}"
        log_message "Fetched $count record types for $object_name"
        return 0
    else
        echo -e "${RED}✗ Failed to fetch record types for $object_name${NC}"
        log_message "ERROR: Failed to fetch record types for $object_name"
        return 1
    fi
}

# Function to fetch picklist values for a field
fetch_picklist_values() {
    local object_name="$1"
    local field_name="$2"
    local cache_file="$CACHE_DIR/${object_name}_${field_name}_picklist.json"
    
    echo -e "${BLUE}↻ Fetching picklist values for $object_name.$field_name...${NC}"
    
    # Get field describe
    local result=$(sf sobject describe --sobject "$object_name" --json 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Extract picklist values for the specific field
        echo "$result" | jq --arg field "$field_name" '
            .result.fields[] | 
            select(.name == $field) | 
            .picklistValues
        ' > "$cache_file"
        
        if [ -s "$cache_file" ] && [ "$(cat "$cache_file")" != "null" ]; then
            local count=$(jq '. | length' "$cache_file")
            echo -e "${GREEN}✓ Found $count picklist values for $field_name${NC}"
            log_message "Fetched $count picklist values for $object_name.$field_name"
            return 0
        else
            echo -e "${RED}✗ $field_name is not a picklist field${NC}"
            rm -f "$cache_file"
            return 1
        fi
    else
        echo -e "${RED}✗ Failed to fetch field metadata${NC}"
        log_message "ERROR: Failed to fetch metadata for $object_name"
        return 1
    fi
}

# Function to get picklist values by record type
get_values_by_record_type() {
    local object_name="$1"
    local field_name="$2"
    local record_type="$3"
    local cache_file="$CACHE_DIR/${object_name}_${field_name}_by_rt.json"
    
    # Try to get record type specific picklist values using UI API
    echo -e "${BLUE}↻ Fetching record type specific values...${NC}"
    
    # First get the record type ID
    local rt_cache="$CACHE_DIR/${object_name}_recordtypes.json"
    if [ ! -f "$rt_cache" ]; then
        fetch_record_types "$object_name"
    fi
    
    local rt_id=$(jq -r --arg rt "$record_type" '
        .[] | select(.DeveloperName == $rt or .Name == $rt) | .Id
    ' "$rt_cache" | head -1)
    
    if [ -z "$rt_id" ]; then
        echo -e "${YELLOW}⚠ Record type '$record_type' not found${NC}"
        return 1
    fi
    
    # Use describe layout to get record type specific picklist values
    local result=$(sf org display --json 2>/dev/null | jq -r '.result.instanceUrl')
    local access_token=$(sf org display --json 2>/dev/null | jq -r '.result.accessToken')
    
    if [ -n "$result" ] && [ -n "$access_token" ]; then
        # Call UI API to get picklist values for specific record type
        local api_result=$(curl -s -H "Authorization: Bearer $access_token" \
            "${result}/services/data/v60.0/ui-api/object-info/${object_name}/picklist-values/${rt_id}/${field_name}" 2>/dev/null)
        
        if [ $? -eq 0 ] && echo "$api_result" | jq -e '.values' >/dev/null 2>&1; then
            echo "$api_result" | jq '.values' > "$cache_file"
            local count=$(jq '. | length' "$cache_file")
            echo -e "${GREEN}✓ Found $count values for record type '$record_type'${NC}"
            return 0
        fi
    fi
    
    # Fallback to general picklist values
    echo -e "${YELLOW}⚠ Using general picklist values (record type specific unavailable)${NC}"
    local general_cache="$CACHE_DIR/${object_name}_${field_name}_picklist.json"
    if [ -f "$general_cache" ]; then
        cp "$general_cache" "$cache_file"
        return 0
    fi
    
    return 1
}

# Function to validate a picklist value
validate_picklist_value() {
    local object_name="$1"
    local field_name="$2"
    local value="$3"
    local record_type="${4:-}"
    
    echo -e "${BLUE}═══ Validating Picklist Value ═══${NC}"
    echo "Object: $object_name"
    echo "Field: $field_name"
    echo "Value: $value"
    if [ -n "$record_type" ]; then
        echo "Record Type: $record_type"
    fi
    echo ""
    
    # Fetch picklist values
    if [ -n "$record_type" ]; then
        get_values_by_record_type "$object_name" "$field_name" "$record_type"
        local cache_file="$CACHE_DIR/${object_name}_${field_name}_by_rt.json"
    else
        fetch_picklist_values "$object_name" "$field_name"
        local cache_file="$CACHE_DIR/${object_name}_${field_name}_picklist.json"
    fi
    
    if [ ! -f "$cache_file" ]; then
        echo -e "${RED}✗ Could not fetch picklist values${NC}"
        return 1
    fi
    
    # Check if value exists (exact match)
    local exact_match=$(jq -r --arg val "$value" '
        .[] | select(.value == $val or .label == $val) | .value
    ' "$cache_file" 2>/dev/null | head -1)
    
    if [ -n "$exact_match" ]; then
        echo -e "${GREEN}✓ Valid picklist value: $value${NC}"
        return 0
    fi
    
    # Check case-insensitive
    local case_match=$(jq -r --arg val "$value" '
        .[] | select((.value | ascii_downcase) == ($val | ascii_downcase) or 
                    (.label | ascii_downcase) == ($val | ascii_downcase)) | .value
    ' "$cache_file" 2>/dev/null | head -1)
    
    if [ -n "$case_match" ]; then
        echo -e "${YELLOW}⚠ Found with different case: $case_match (you provided: $value)${NC}"
        return 2
    fi
    
    # Check if value is inactive
    local inactive=$(jq -r --arg val "$value" '
        .[] | select(.value == $val and .active == false) | .value
    ' "$cache_file" 2>/dev/null | head -1)
    
    if [ -n "$inactive" ]; then
        echo -e "${YELLOW}⚠ Value exists but is inactive: $value${NC}"
        return 3
    fi
    
    echo -e "${RED}✗ Invalid picklist value: $value${NC}"
    
    # Show available values
    echo -e "\n${CYAN}Available values:${NC}"
    jq -r '.[] | select(.active != false) | "  • " + .value + " (" + .label + ")"' "$cache_file" 2>/dev/null | head -10
    
    local total=$(jq '[.[] | select(.active != false)] | length' "$cache_file")
    if [ "$total" -gt 10 ]; then
        echo "  ... and $((total - 10)) more"
    fi
    
    return 1
}

# Function to validate multiple values from CSV
validate_csv_picklists() {
    local csv_file="$1"
    local object_name="$2"
    local field_name="$3"
    local record_type_field="${4:-}"
    local value_column="${5:-1}"
    
    if [ ! -f "$csv_file" ]; then
        echo -e "${RED}✗ CSV file not found: $csv_file${NC}"
        return 1
    fi
    
    echo -e "${BLUE}═══ Validating CSV Picklist Values ═══${NC}"
    echo "File: $csv_file"
    echo "Object: $object_name"
    echo "Field: $field_name"
    echo ""
    
    local total=0
    local valid=0
    local invalid=0
    local warnings=0
    local errors_file="${csv_file%.csv}_picklist_errors.csv"
    
    echo "Row,Value,Status,Message" > "$errors_file"
    
    # Skip header and process each line
    tail -n +2 "$csv_file" | while IFS=',' read -ra fields; do
        ((total++))
        local value="${fields[$((value_column - 1))]}"
        local record_type=""
        
        if [ -n "$record_type_field" ] && [ "$record_type_field" -gt 0 ]; then
            record_type="${fields[$((record_type_field - 1))]}"
        fi
        
        # Remove quotes if present
        value="${value%\"}"
        value="${value#\"}"
        
        validate_picklist_value "$object_name" "$field_name" "$value" "$record_type" >/dev/null 2>&1
        local status=$?
        
        case $status in
            0)
                ((valid++))
                echo -n "."
                ;;
            2)
                ((warnings++))
                echo -n "W"
                echo "$total,\"$value\",Warning,Case mismatch" >> "$errors_file"
                ;;
            3)
                ((warnings++))
                echo -n "I"
                echo "$total,\"$value\",Warning,Inactive value" >> "$errors_file"
                ;;
            *)
                ((invalid++))
                echo -n "X"
                echo "$total,\"$value\",Error,Invalid value" >> "$errors_file"
                ;;
        esac
        
        if [ $((total % 50)) -eq 0 ]; then
            echo " [$total]"
        fi
    done
    
    echo -e "\n\n${BLUE}═══ Validation Summary ═══${NC}"
    echo -e "${GREEN}✓ Valid: $valid${NC}"
    echo -e "${YELLOW}⚠ Warnings: $warnings${NC}"
    echo -e "${RED}✗ Invalid: $invalid${NC}"
    echo -e "Total: $total"
    
    if [ "$invalid" -gt 0 ] || [ "$warnings" -gt 0 ]; then
        echo -e "\n${CYAN}Error details saved to: $errors_file${NC}"
    else
        rm -f "$errors_file"
    fi
    
    if [ "$invalid" -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# Function to map picklist values between orgs
map_picklist_values() {
    local object_name="$1"
    local field_name="$2"
    local source_org="${3:-source}"
    local target_org="${4:-target}"
    
    echo -e "${BLUE}═══ Picklist Value Mapping ═══${NC}"
    echo "Object: $object_name"
    echo "Field: $field_name"
    echo "Source: $source_org → Target: $target_org"
    echo ""
    
    # Fetch from source
    SF_TARGET_ORG="$source_org" fetch_picklist_values "$object_name" "$field_name"
    mv "$CACHE_DIR/${object_name}_${field_name}_picklist.json" "$CACHE_DIR/${object_name}_${field_name}_${source_org}.json"
    
    # Fetch from target
    SF_TARGET_ORG="$target_org" fetch_picklist_values "$object_name" "$field_name"
    mv "$CACHE_DIR/${object_name}_${field_name}_picklist.json" "$CACHE_DIR/${object_name}_${field_name}_${target_org}.json"
    
    # Create mapping
    local mapping_file="$PROJECT_ROOT/data/picklist_mapping_${object_name}_${field_name}.csv"
    echo "Source Value,Target Value,Status" > "$mapping_file"
    
    # Process source values
    jq -r '.[] | .value' "$CACHE_DIR/${object_name}_${field_name}_${source_org}.json" | while read -r source_val; do
        # Check if exists in target
        local target_match=$(jq -r --arg val "$source_val" '
            .[] | select(.value == $val) | .value
        ' "$CACHE_DIR/${object_name}_${field_name}_${target_org}.json" 2>/dev/null | head -1)
        
        if [ -n "$target_match" ]; then
            echo "\"$source_val\",\"$target_match\",Exact Match" >> "$mapping_file"
        else
            # Try case-insensitive match
            local case_match=$(jq -r --arg val "$source_val" '
                .[] | select((.value | ascii_downcase) == ($val | ascii_downcase)) | .value
            ' "$CACHE_DIR/${object_name}_${field_name}_${target_org}.json" 2>/dev/null | head -1)
            
            if [ -n "$case_match" ]; then
                echo "\"$source_val\",\"$case_match\",Case Difference" >> "$mapping_file"
            else
                echo "\"$source_val\",,Missing in Target" >> "$mapping_file"
            fi
        fi
    done
    
    echo -e "${GREEN}✓ Mapping saved to: $mapping_file${NC}"
    
    # Show summary
    echo -e "\n${BLUE}Summary:${NC}"
    echo "  Exact matches: $(grep -c "Exact Match" "$mapping_file")"
    echo "  Case differences: $(grep -c "Case Difference" "$mapping_file")"
    echo "  Missing in target: $(grep -c "Missing in Target" "$mapping_file")"
}

# Function to suggest alternatives for invalid values
suggest_alternatives() {
    local object_name="$1"
    local field_name="$2"
    local invalid_value="$3"
    local cache_file="$CACHE_DIR/${object_name}_${field_name}_picklist.json"
    
    if [ ! -f "$cache_file" ]; then
        fetch_picklist_values "$object_name" "$field_name"
    fi
    
    echo -e "${CYAN}Suggestions for '$invalid_value':${NC}"
    
    # Find similar values using fuzzy matching
    local suggestions=$(jq -r --arg val "$invalid_value" '
        .[] | 
        select(.active != false) |
        select(.value | test($val; "i") or .label | test($val; "i")) |
        .value + " (" + .label + ")"
    ' "$cache_file" 2>/dev/null | head -5)
    
    if [ -n "$suggestions" ]; then
        echo "$suggestions" | while IFS= read -r line; do
            echo "  • $line"
        done
    else
        echo "  No similar values found"
        echo "  Consider using one of the standard values shown above"
    fi
}

# Main menu
show_menu() {
    echo -e "\n${BLUE}═══ Picklist Value Validator ═══${NC}"
    echo "1) Validate single value"
    echo "2) Validate CSV file"
    echo "3) List record types"
    echo "4) Show picklist values"
    echo "5) Map values between orgs"
    echo "6) Clear cache"
    echo "7) Exit"
    echo -n "Select option: "
}

# Interactive mode
interactive_mode() {
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                echo -n "Object name: "
                read -r object
                echo -n "Field name: "
                read -r field
                echo -n "Value to validate: "
                read -r value
                echo -n "Record type (optional): "
                read -r rt
                validate_picklist_value "$object" "$field" "$value" "$rt"
                ;;
            2)
                echo -n "CSV file path: "
                read -r csv
                echo -n "Object name: "
                read -r object
                echo -n "Field name: "
                read -r field
                echo -n "Value column number: "
                read -r col
                echo -n "Record type column (optional): "
                read -r rt_col
                validate_csv_picklists "$csv" "$object" "$field" "$rt_col" "$col"
                ;;
            3)
                echo -n "Object name: "
                read -r object
                fetch_record_types "$object"
                jq -r '.[] | "  • " + .Name + " (" + .DeveloperName + ")"' "$CACHE_DIR/${object}_recordtypes.json" 2>/dev/null
                ;;
            4)
                echo -n "Object name: "
                read -r object
                echo -n "Field name: "
                read -r field
                fetch_picklist_values "$object" "$field"
                jq -r '.[] | select(.active != false) | "  • " + .value + " (" + .label + ")"' "$CACHE_DIR/${object}_${field}_picklist.json" 2>/dev/null
                ;;
            5)
                echo -n "Object name: "
                read -r object
                echo -n "Field name: "
                read -r field
                echo -n "Source org: "
                read -r source
                echo -n "Target org: "
                read -r target
                map_picklist_values "$object" "$field" "$source" "$target"
                ;;
            6)
                rm -rf "$CACHE_DIR"/*
                echo -e "${GREEN}✓ Cache cleared${NC}"
                ;;
            7)
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac
    done
}

# Command line mode
if [ $# -eq 0 ]; then
    interactive_mode
else
    case "$1" in
        validate)
            validate_picklist_value "$2" "$3" "$4" "${5:-}"
            ;;
        csv)
            validate_csv_picklists "$2" "$3" "$4" "${5:-}" "${6:-1}"
            ;;
        recordtypes)
            fetch_record_types "$2"
            ;;
        values)
            fetch_picklist_values "$2" "$3"
            ;;
        map)
            map_picklist_values "$2" "$3" "${4:-source}" "${5:-target}"
            ;;
        clear)
            rm -rf "$CACHE_DIR"/*
            echo -e "${GREEN}✓ Cache cleared${NC}"
            ;;
        *)
            echo "Usage: $0 {validate|csv|recordtypes|values|map|clear} [options]"
            echo ""
            echo "Commands:"
            echo "  validate <obj> <field> <val> [rt] - Validate single value"
            echo "  csv <file> <obj> <field> [rt] [col] - Validate CSV file"
            echo "  recordtypes <object>              - List record types"
            echo "  values <object> <field>           - Show picklist values"
            echo "  map <obj> <field> [src] [tgt]    - Map values between orgs"
            echo "  clear                             - Clear cache"
            exit 1
            ;;
    esac
fi