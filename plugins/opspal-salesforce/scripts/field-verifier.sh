#!/bin/bash

# Field Verification System for Salesforce
# Validates field API names and provides suggestions for corrections

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CACHE_DIR="$PROJECT_ROOT/data/field-metadata"
LOG_FILE="$PROJECT_ROOT/logs/field-verifier.log"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$CACHE_DIR" "$(dirname "$LOG_FILE")"

# Load environment
source "$PROJECT_ROOT/.env" 2>/dev/null || true

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Function to fetch and cache field metadata
fetch_field_metadata() {
    local object_name="$1"
    local cache_file="$CACHE_DIR/${object_name}_fields.json"
    
    # Check if cache exists and is less than 24 hours old
    if [ -f "$cache_file" ]; then
        local cache_age=$(($(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null || echo 0)))
        if [ "$cache_age" -lt 86400 ]; then
            echo -e "${GREEN}✓ Using cached metadata for $object_name${NC}"
            return 0
        fi
    fi
    
    echo -e "${BLUE}↻ Fetching field metadata for $object_name...${NC}"
    
    # Fetch field metadata using SF CLI
    local result=$(sf sobject describe --sobject "$object_name" --json 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "$result" | jq '.result.fields' > "$cache_file"
        echo -e "${GREEN}✓ Cached field metadata for $object_name${NC}"
        log_message "Fetched metadata for $object_name"
        return 0
    else
        echo -e "${RED}✗ Failed to fetch metadata for $object_name${NC}"
        log_message "ERROR: Failed to fetch metadata for $object_name"
        return 1
    fi
}

# Function to verify field exists
verify_field() {
    local object_name="$1"
    local field_name="$2"
    local cache_file="$CACHE_DIR/${object_name}_fields.json"
    
    # Ensure we have metadata
    fetch_field_metadata "$object_name"
    
    if [ ! -f "$cache_file" ]; then
        echo -e "${RED}✗ No metadata available for $object_name${NC}"
        return 1
    fi
    
    # Check if field exists (case-insensitive)
    local exact_match=$(jq -r --arg field "$field_name" \
        '.[] | select(.name == $field) | .name' "$cache_file" 2>/dev/null)
    
    if [ -n "$exact_match" ]; then
        echo -e "${GREEN}✓ Field verified: $field_name${NC}"
        return 0
    fi
    
    # Case-insensitive search
    local case_match=$(jq -r --arg field "$field_name" \
        '.[] | select(.name | ascii_downcase == ($field | ascii_downcase)) | .name' "$cache_file" 2>/dev/null)
    
    if [ -n "$case_match" ]; then
        echo -e "${YELLOW}⚠ Field found with different case: $case_match (you provided: $field_name)${NC}"
        return 2
    fi
    
    echo -e "${RED}✗ Field not found: $field_name${NC}"
    return 1
}

# Function to suggest similar fields
suggest_fields() {
    local object_name="$1"
    local field_name="$2"
    local cache_file="$CACHE_DIR/${object_name}_fields.json"
    
    if [ ! -f "$cache_file" ]; then
        return 1
    fi
    
    echo -e "${BLUE}Suggestions for '$field_name':${NC}"
    
    # Find fields with similar names
    local suggestions=$(jq -r --arg field "$field_name" '
        .[] | 
        select(.name | test($field; "i")) | 
        .name + " (" + .label + " - " + .type + ")"
    ' "$cache_file" 2>/dev/null | head -5)
    
    if [ -z "$suggestions" ]; then
        # Try to find fields with similar labels
        suggestions=$(jq -r --arg field "$field_name" '
            .[] | 
            select(.label | test($field; "i")) | 
            .name + " (" + .label + " - " + .type + ")"
        ' "$cache_file" 2>/dev/null | head -5)
    fi
    
    if [ -n "$suggestions" ]; then
        echo "$suggestions" | while IFS= read -r line; do
            echo "  • $line"
        done
    else
        echo "  No similar fields found"
    fi
}

# Function to validate multiple fields
validate_field_list() {
    local object_name="$1"
    shift
    local fields=("$@")
    local all_valid=true
    local results=()
    
    echo -e "${BLUE}═══ Validating ${#fields[@]} fields on $object_name ═══${NC}"
    
    for field in "${fields[@]}"; do
        verify_field "$object_name" "$field"
        local status=$?
        
        if [ $status -eq 0 ]; then
            results+=("✓ $field")
        elif [ $status -eq 2 ]; then
            results+=("⚠ $field (case mismatch)")
            all_valid=false
        else
            results+=("✗ $field (not found)")
            suggest_fields "$object_name" "$field"
            all_valid=false
        fi
    done
    
    echo -e "\n${BLUE}Summary:${NC}"
    for result in "${results[@]}"; do
        echo "  $result"
    done
    
    if $all_valid; then
        echo -e "\n${GREEN}✓ All fields validated successfully${NC}"
        return 0
    else
        echo -e "\n${YELLOW}⚠ Some fields need attention${NC}"
        return 1
    fi
}

# Function to export field list
export_field_list() {
    local object_name="$1"
    local output_file="${2:-${object_name}_fields.csv}"
    local cache_file="$CACHE_DIR/${object_name}_fields.json"
    
    fetch_field_metadata "$object_name"
    
    if [ ! -f "$cache_file" ]; then
        echo -e "${RED}✗ No metadata available for $object_name${NC}"
        return 1
    fi
    
    echo "Field API Name,Label,Type,Required,Custom" > "$output_file"
    
    jq -r '.[] | [.name, .label, .type, .nillable | not, .custom] | @csv' "$cache_file" >> "$output_file"
    
    echo -e "${GREEN}✓ Exported field list to $output_file${NC}"
    log_message "Exported fields for $object_name to $output_file"
}

# Function to compare fields between orgs
compare_org_fields() {
    local object_name="$1"
    local source_org="${2:-source}"
    local target_org="${3:-target}"
    
    echo -e "${BLUE}Comparing $object_name fields between $source_org and $target_org...${NC}"
    
    # Fetch from source org
    SF_TARGET_ORG="$source_org" fetch_field_metadata "$object_name"
    mv "$CACHE_DIR/${object_name}_fields.json" "$CACHE_DIR/${object_name}_${source_org}.json"
    
    # Fetch from target org
    SF_TARGET_ORG="$target_org" fetch_field_metadata "$object_name"
    mv "$CACHE_DIR/${object_name}_fields.json" "$CACHE_DIR/${object_name}_${target_org}.json"
    
    # Compare
    echo -e "\n${BLUE}Fields only in $source_org:${NC}"
    comm -23 <(jq -r '.[].name' "$CACHE_DIR/${object_name}_${source_org}.json" | sort) \
             <(jq -r '.[].name' "$CACHE_DIR/${object_name}_${target_org}.json" | sort) | \
             sed 's/^/  • /'
    
    echo -e "\n${BLUE}Fields only in $target_org:${NC}"
    comm -13 <(jq -r '.[].name' "$CACHE_DIR/${object_name}_${source_org}.json" | sort) \
             <(jq -r '.[].name' "$CACHE_DIR/${object_name}_${target_org}.json" | sort) | \
             sed 's/^/  • /'
}

# Main menu
show_menu() {
    echo -e "\n${BLUE}═══ Salesforce Field Verifier ═══${NC}"
    echo "1) Verify single field"
    echo "2) Validate field list"
    echo "3) Export all fields for object"
    echo "4) Refresh metadata cache"
    echo "5) Compare fields between orgs"
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
                verify_field "$object" "$field"
                if [ $? -ne 0 ]; then
                    suggest_fields "$object" "$field"
                fi
                ;;
            2)
                echo -n "Object name: "
                read -r object
                echo "Enter field names (comma-separated): "
                read -r field_list
                IFS=',' read -ra fields <<< "$field_list"
                validate_field_list "$object" "${fields[@]// /}"
                ;;
            3)
                echo -n "Object name: "
                read -r object
                echo -n "Output file (default: ${object}_fields.csv): "
                read -r output
                export_field_list "$object" "${output:-${object}_fields.csv}"
                ;;
            4)
                echo -n "Object name: "
                read -r object
                rm -f "$CACHE_DIR/${object}_fields.json"
                fetch_field_metadata "$object"
                ;;
            5)
                echo -n "Object name: "
                read -r object
                echo -n "Source org alias: "
                read -r source
                echo -n "Target org alias: "
                read -r target
                compare_org_fields "$object" "$source" "$target"
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
        verify)
            verify_field "$2" "$3"
            if [ $? -ne 0 ]; then
                suggest_fields "$2" "$3"
            fi
            ;;
        validate)
            shift
            object="$1"
            shift
            validate_field_list "$object" "$@"
            ;;
        export)
            export_field_list "$2" "$3"
            ;;
        compare)
            compare_org_fields "$2" "$3" "$4"
            ;;
        cache)
            fetch_field_metadata "$2"
            ;;
        clear)
            rm -rf "$CACHE_DIR"/*
            echo -e "${GREEN}✓ Cache cleared${NC}"
            ;;
        *)
            echo "Usage: $0 {verify|validate|export|compare|cache|clear} [options]"
            echo ""
            echo "Commands:"
            echo "  verify <object> <field>     - Verify single field"
            echo "  validate <object> <fields>  - Validate multiple fields"
            echo "  export <object> [file]      - Export field list to CSV"
            echo "  compare <object> [src] [tgt]- Compare fields between orgs"
            echo "  cache <object>              - Refresh metadata cache"
            echo "  clear                       - Clear all cached metadata"
            exit 1
            ;;
    esac
fi