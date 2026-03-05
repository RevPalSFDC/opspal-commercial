#!/bin/bash

# Salesforce Analytics Automation Workflow
# 
# Implements the minimal, reliable automation flow for report creation
# with discovery, validation, and error handling based on REST API best practices
#
# Usage: ./analytics-automation.sh [command] [options]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISCOVERY_TOOL="${SCRIPT_DIR}/lib/analytics-discovery.js"
ERROR_HANDLER="${SCRIPT_DIR}/lib/analytics-error-handler.js"
TEMPLATE_DIR="${SCRIPT_DIR}/templates"
LOG_DIR="${SCRIPT_DIR}/logs"
CACHE_DIR="${SCRIPT_DIR}/.cache"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ensure directories exist
mkdir -p "$LOG_DIR" "$CACHE_DIR"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_DIR}/analytics-automation.log"
}

# Error handling
handle_error() {
    local error_msg="$1"
    echo -e "${RED}ERROR: ${error_msg}${NC}" >&2
    
    # Analyze error for recovery suggestions
    if [ -f "$ERROR_HANDLER" ]; then
        echo -e "${YELLOW}Analyzing error for recovery suggestions...${NC}"
        node "$ERROR_HANDLER" analyze "$error_msg"
    fi
    
    exit 1
}

# Success message
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Step 1: Resolve folder ID from name
resolve_folder() {
    local folder_name="$1"
    local org_alias="$2"
    
    log "Step 1: Resolving folder ID for '${folder_name}'"
    
    local result
    if [ -z "$folder_name" ]; then
        result=$(node "$DISCOVERY_TOOL" folders --org="$org_alias" 2>&1) || handle_error "$result"
        echo "$result" | jq -r '.[] | "\(.id) - \(.label) (\(.namespace // "standard"))"'
        echo -e "${YELLOW}Please select a folder ID from the list above${NC}"
        read -p "Folder ID: " folder_id
    else
        result=$(node "$DISCOVERY_TOOL" folders "$folder_name" --org="$org_alias" 2>&1) || handle_error "$result"
        folder_id=$(echo "$result" | jq -r '.id // empty')
        
        if [ -z "$folder_id" ]; then
            handle_error "Folder '${folder_name}' not found"
        fi
        
        local namespace=$(echo "$result" | jq -r '.namespace // "standard"')
        success "Found folder: ${folder_name} (ID: ${folder_id}, Namespace: ${namespace})"
    fi
    
    echo "$folder_id"
}

# Step 2: Discover report types
discover_report_types() {
    local filter="$1"
    local org_alias="$2"
    
    log "Step 2: Discovering report types with filter '${filter}'"
    
    local result
    result=$(node "$DISCOVERY_TOOL" types "$filter" --org="$org_alias" 2>&1) || handle_error "$result"
    
    local count=$(echo "$result" | jq -r 'length')
    
    if [ "$count" -eq 0 ]; then
        handle_error "No report types found matching '${filter}'"
    elif [ "$count" -eq 1 ]; then
        local report_type=$(echo "$result" | jq -r '.[0].type')
        local label=$(echo "$result" | jq -r '.[0].label')
        success "Found report type: ${label} (${report_type})"
        echo "$report_type"
    else
        echo "Found ${count} report types:" >&2
        echo "$result" | jq -r '.[] | "\(.type) - \(.label) [\(.category)]"' >&2
        echo -e "${YELLOW}Multiple report types found. Please select one:${NC}" >&2
        read -p "Report Type API Name: " report_type
        echo "$report_type"
    fi
}

# Step 3: Describe report type fields
describe_fields() {
    local report_type="$1"
    local org_alias="$2"
    
    log "Step 3: Describing fields for report type '${report_type}'"
    
    local result
    result=$(node "$DISCOVERY_TOOL" describe "$report_type" --org="$org_alias" 2>&1) || handle_error "$result"
    
    local field_count=$(echo "$result" | jq -r '.totalFields')
    local custom_count=$(echo "$result" | jq -r '.customFields')
    
    success "Report type has ${field_count} fields (${custom_count} custom)"
    
    # Cache the field description for later use
    echo "$result" > "${CACHE_DIR}/fields_${report_type}.json"
    
    # Show sample fields
    echo "Sample fields available:"
    echo "$result" | jq -r '.fields[:10][] | "  - \(.token) (\(.label)) [\(.dataType)]"'
}

# Step 4: Validate report metadata
validate_metadata() {
    local metadata_file="$1"
    local org_alias="$2"
    
    log "Step 4: Validating report metadata from '${metadata_file}'"
    
    if [ ! -f "$metadata_file" ]; then
        handle_error "Metadata file not found: ${metadata_file}"
    fi
    
    local result
    result=$(node "$DISCOVERY_TOOL" validate "$metadata_file" --org="$org_alias" 2>&1)
    
    if echo "$result" | jq -e '.valid == true' > /dev/null 2>&1; then
        success "Report metadata is valid"
        return 0
    else
        local error=$(echo "$result" | jq -r '.error // .message')
        local suggestion=$(echo "$result" | jq -r '.suggestion // "Check metadata structure"')
        
        echo -e "${RED}Validation failed: ${error}${NC}" >&2
        echo -e "${YELLOW}Suggestion: ${suggestion}${NC}" >&2
        
        # Offer to fix common issues
        read -p "Attempt automatic fix? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            fix_metadata "$metadata_file" "$result"
            # Retry validation
            validate_metadata "$metadata_file" "$org_alias"
        else
            return 1
        fi
    fi
}

# Step 5: Create report
create_report() {
    local metadata_file="$1"
    local org_alias="$2"
    
    log "Step 5: Creating report from metadata"
    
    # Use curl to make the API call
    local auth_info=$(sf org display --json --target-org "$org_alias" 2>/dev/null | jq -r '.result')
    local access_token=$(echo "$auth_info" | jq -r '.accessToken')
    local instance_url=$(echo "$auth_info" | jq -r '.instanceUrl')
    
    if [ -z "$access_token" ] || [ -z "$instance_url" ]; then
        handle_error "Failed to get Salesforce authentication"
    fi
    
    local response
    response=$(curl -s -X POST \
        "${instance_url}/services/data/v64.0/analytics/reports" \
        -H "Authorization: Bearer ${access_token}" \
        -H "Content-Type: application/json" \
        -d @"$metadata_file")
    
    if echo "$response" | jq -e '.id' > /dev/null 2>&1; then
        local report_id=$(echo "$response" | jq -r '.id')
        local report_name=$(echo "$response" | jq -r '.reportMetadata.name')
        success "Report created successfully!"
        echo "  Name: ${report_name}"
        echo "  ID: ${report_id}"
        echo "  URL: ${instance_url}/lightning/r/Report/${report_id}/view"
        
        # Save to log
        echo "$response" > "${LOG_DIR}/report_${report_id}.json"
    else
        local error=$(echo "$response" | jq -r '.message // .[0].message // "Unknown error"')
        handle_error "Report creation failed: ${error}"
    fi
}

# Fix common metadata issues
fix_metadata() {
    local metadata_file="$1"
    local validation_result="$2"
    
    log "Attempting to fix metadata issues"
    
    local error_code=$(echo "$validation_result" | jq -r '.errorCode // "UNKNOWN"')
    
    case "$error_code" in
        NULL_FOLDER_ID)
            echo "Fixing: Adding folder ID"
            # Prompt for folder
            read -p "Enter folder name or ID: " folder_input
            local folder_id=$(resolve_folder "$folder_input" "")
            jq ".reportMetadata.folderId = \"${folder_id}\"" "$metadata_file" > "${metadata_file}.tmp"
            mv "${metadata_file}.tmp" "$metadata_file"
            ;;
            
        INVALID_AGGREGATE)
            echo "Fixing: Correcting aggregate syntax"
            # Fix aggregate prefixes
            jq '.reportMetadata.aggregates |= map(
                if .name | test("^SUM\\(") then .name = "s!" + (.name | gsub("^SUM\\(|\\)$"; ""))
                elif .name | test("^AVG\\(") then .name = "a!" + (.name | gsub("^AVG\\(|\\)$"; ""))
                elif .name | test("^MAX\\(") then .name = "mx!" + (.name | gsub("^MAX\\(|\\)$"; ""))
                elif .name | test("^MIN\\(") then .name = "mn!" + (.name | gsub("^MIN\\(|\\)$"; ""))
                else . end
            )' "$metadata_file" > "${metadata_file}.tmp"
            mv "${metadata_file}.tmp" "$metadata_file"
            ;;
            
        *)
            echo "Unable to automatically fix error code: ${error_code}"
            return 1
            ;;
    esac
    
    success "Metadata fixed"
}

# Create report from template
create_from_template() {
    local template_name="$1"
    local org_alias="$2"
    
    log "Creating report from template: ${template_name}"
    
    local template_file="${TEMPLATE_DIR}/gong-report-templates.json"
    
    if [ ! -f "$template_file" ]; then
        handle_error "Template file not found: ${template_file}"
    fi
    
    # Extract template
    local template=$(jq -r ".templates.${template_name} // empty" "$template_file")
    
    if [ -z "$template" ] || [ "$template" = "null" ]; then
        echo "Available templates:"
        jq -r '.templates | keys[]' "$template_file"
        handle_error "Template '${template_name}' not found"
    fi
    
    # Get folder
    read -p "Enter report folder name (or press Enter for default): " folder_name
    local folder_id=$(resolve_folder "$folder_name" "$org_alias")
    
    # Build metadata with folder ID
    local metadata=$(echo "$template" | jq ".metadata.folderId = \"${folder_id}\"")
    
    # Save to temp file
    local temp_metadata="${CACHE_DIR}/temp_metadata_$$.json"
    echo "{\"reportMetadata\": $metadata}" > "$temp_metadata"
    
    # Validate and create
    if validate_metadata "$temp_metadata" "$org_alias"; then
        create_report "$temp_metadata" "$org_alias"
    fi
    
    # Cleanup
    rm -f "$temp_metadata"
}

# Main workflow
main() {
    local command="$1"
    shift
    
    case "$command" in
        create)
            # Full workflow for creating a report
            local org_alias=""
            local folder_name=""
            local report_type_filter=""
            local metadata_file=""
            
            # Parse arguments
            while [[ $# -gt 0 ]]; do
                case $1 in
                    --org)
                        org_alias="$2"
                        shift 2
                        ;;
                    --folder)
                        folder_name="$2"
                        shift 2
                        ;;
                    --type)
                        report_type_filter="$2"
                        shift 2
                        ;;
                    --metadata)
                        metadata_file="$2"
                        shift 2
                        ;;
                    *)
                        echo "Unknown option: $1"
                        exit 1
                        ;;
                esac
            done
            
            echo "=== Salesforce Report Creation Workflow ==="
            
            # Step 1: Resolve folder
            folder_id=$(resolve_folder "$folder_name" "$org_alias")
            
            # Step 2: Discover report type
            if [ -z "$metadata_file" ]; then
                report_type=$(discover_report_types "$report_type_filter" "$org_alias")
                
                # Step 3: Describe fields
                describe_fields "$report_type" "$org_alias"
                
                echo -e "${YELLOW}Please create your metadata file with the available fields${NC}"
                read -p "Enter metadata file path when ready: " metadata_file
            fi
            
            # Step 4: Validate metadata
            if validate_metadata "$metadata_file" "$org_alias"; then
                # Step 5: Create report
                create_report "$metadata_file" "$org_alias"
            fi
            ;;
            
        template)
            # Create from template
            local template_name="$2"
            local org_alias="${3:-}"
            
            if [ -z "$template_name" ]; then
                echo "Available templates:"
                jq -r '.templates | keys[]' "${TEMPLATE_DIR}/gong-report-templates.json"
                echo
                echo "Usage: $0 template <template_name> [org_alias]"
                exit 1
            fi
            
            create_from_template "$template_name" "$org_alias"
            ;;
            
        discover)
            # Just discover report types
            local filter="${2:-}"
            local org_alias="${3:-}"
            discover_report_types "$filter" "$org_alias"
            ;;
            
        describe)
            # Describe a report type
            local report_type="$2"
            local org_alias="${3:-}"
            
            if [ -z "$report_type" ]; then
                echo "Usage: $0 describe <report_type> [org_alias]"
                exit 1
            fi
            
            describe_fields "$report_type" "$org_alias"
            ;;
            
        validate)
            # Validate metadata file
            local metadata_file="$2"
            local org_alias="${3:-}"
            
            if [ -z "$metadata_file" ]; then
                echo "Usage: $0 validate <metadata_file> [org_alias]"
                exit 1
            fi
            
            validate_metadata "$metadata_file" "$org_alias"
            ;;
            
        *)
            echo "Salesforce Analytics Automation Workflow"
            echo
            echo "Usage: $0 <command> [options]"
            echo
            echo "Commands:"
            echo "  create    - Full workflow to create a report"
            echo "    Options:"
            echo "      --org <alias>      - Salesforce org alias"
            echo "      --folder <name>    - Report folder name"
            echo "      --type <filter>    - Report type filter"
            echo "      --metadata <file>  - Pre-existing metadata file"
            echo
            echo "  template <name> [org] - Create report from template"
            echo "  discover [filter] [org] - Discover report types"
            echo "  describe <type> [org] - Describe report type fields"
            echo "  validate <file> [org] - Validate metadata file"
            echo
            echo "Examples:"
            echo "  $0 create --type Gong --folder 'Sales Reports'"
            echo "  $0 template calls_last_30_days myorg"
            echo "  $0 discover Opportunity"
            echo "  $0 describe 'Gong__Opportunities_with_Gong_Conversations_and_contacts'"
            echo "  $0 validate metadata.json myorg"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"