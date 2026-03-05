#!/bin/bash

##############################################################################
# mcp-adapter.sh - Bridge between bash scripts and MCP tools
##############################################################################
# Provides functions to invoke MCP tools from bash scripts
# Maintains backward compatibility while leveraging MCP performance
##############################################################################

# Colors
[[ -z "$RED" ]] && RED='\033[0;31m'
[[ -z "$GREEN" ]] && GREEN='\033[0;32m'
[[ -z "$YELLOW" ]] && YELLOW='\033[1;33m'
[[ -z "$BLUE" ]] && BLUE='\033[0;34m'
[[ -z "$CYAN" ]] && CYAN='\033[0;36m'
[[ -z "$NC" ]] && NC='\033[0m'

# Configuration
MCP_TOOLS_DIR="${MCP_TOOLS_DIR:-$(dirname "$0")/../../mcp-tools}"
MCP_SERVER="${MCP_SERVER:-salesforce-dx}"
USE_MCP="${USE_MCP:-auto}"  # auto, true, false

# Check if MCP tools are available
check_mcp_availability() {
    # Check if MCP tools directory exists
    if [[ ! -d "$MCP_TOOLS_DIR" ]]; then
        if [[ "$USE_MCP" == "true" ]]; then
            echo -e "${RED}MCP tools directory not found: $MCP_TOOLS_DIR${NC}" >&2
            return 1
        fi
        return 1
    fi
    
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        if [[ "$USE_MCP" == "true" ]]; then
            echo -e "${RED}Node.js is required for MCP tools${NC}" >&2
            return 1
        fi
        return 1
    fi
    
    # Check if MCP server is configured
    if ! node -e "require('$MCP_TOOLS_DIR/check-mcp.js')" 2>/dev/null; then
        if [[ "$USE_MCP" == "true" ]]; then
            echo -e "${YELLOW}MCP server not configured or not running${NC}" >&2
        fi
        return 1
    fi
    
    return 0
}

# Function to execute MCP tool or fallback to CLI
mcp_execute() {
    local tool_name="$1"
    shift
    local fallback_command="$1"
    shift
    local args="$@"
    
    # Determine if we should use MCP
    local use_mcp_now=false
    
    if [[ "$USE_MCP" == "true" ]]; then
        use_mcp_now=true
    elif [[ "$USE_MCP" == "auto" ]]; then
        if check_mcp_availability 2>/dev/null; then
            use_mcp_now=true
        fi
    fi
    
    if [[ "$use_mcp_now" == true ]]; then
        # Use MCP tool
        node "$MCP_TOOLS_DIR/$tool_name.js" $args 2>/dev/null
        local result=$?
        
        if [[ $result -eq 0 ]]; then
            return 0
        else
            # Fallback to CLI on MCP failure
            [[ "$VERBOSE" == true ]] && echo -e "${YELLOW}MCP tool failed, falling back to CLI${NC}" >&2
            eval "$fallback_command $args"
            return $?
        fi
    else
        # Use CLI directly
        eval "$fallback_command $args"
        return $?
    fi
}

# Query Salesforce data using MCP or CLI
mcp_query() {
    local query="$1"
    local org_alias="${2:-}"
    local use_tooling="${3:-false}"
    
    local cli_cmd="sf data query --query \"$query\""
    [[ -n "$org_alias" ]] && cli_cmd="$cli_cmd --target-org $org_alias"
    [[ "$use_tooling" == "true" ]] && cli_cmd="$cli_cmd --use-tooling-api"
    cli_cmd="$cli_cmd --json"
    
    mcp_execute "query" "$cli_cmd" --query "$query" --org "$org_alias" --tooling "$use_tooling"
}

# Get record type information using MCP
mcp_get_record_types() {
    local object="$1"
    local org_alias="${2:-}"
    
    local query="SELECT Id, Name, DeveloperName, IsActive FROM RecordType WHERE SobjectType = '${object}'"
    mcp_query "$query" "$org_alias"
}

# Get picklist values for a field using MCP
mcp_get_picklist_values() {
    local object="$1"
    local field="$2"
    local record_type_id="$3"
    local org_alias="${4:-}"
    
    if check_mcp_availability 2>/dev/null; then
        # Use MCP tool for better performance
        node "$MCP_TOOLS_DIR/get-picklist-values.js" \
            --object "$object" \
            --field "$field" \
            --recordType "$record_type_id" \
            --org "$org_alias" 2>/dev/null
    else
        # Fallback to REST API via CLI
        local endpoint="/services/data/v60.0/ui-api/object-info/${object}/picklist-values/${record_type_id}/${field}"
        sf api request rest "$endpoint" --method GET --target-org "$org_alias" 2>/dev/null
    fi
}

# Validate CSV using MCP
mcp_validate_csv() {
    local csv_file="$1"
    local object="$2"
    local org_alias="${3:-}"
    
    if check_mcp_availability 2>/dev/null; then
        # Use MCP CSV validator
        node "$MCP_TOOLS_DIR/csv-validator.js" \
            --file "$csv_file" \
            --object "$object" \
            --org "$org_alias" 2>/dev/null
        return $?
    else
        # Fallback to basic validation
        echo -e "${YELLOW}MCP validator not available, using basic validation${NC}" >&2
        
        # Basic header validation
        local headers=$(head -1 "$csv_file")
        local query="SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${object}'"
        local valid_fields=$(mcp_query "$query" "$org_alias" true | jq -r '.result.records[].QualifiedApiName')
        
        local invalid_count=0
        echo "$headers" | tr ',' '\n' | while read -r header; do
            if ! echo "$valid_fields" | grep -q "^${header}$"; then
                echo "Invalid field: $header"
                invalid_count=$((invalid_count + 1))
            fi
        done
        
        return $([ $invalid_count -eq 0 ])
    fi
}

# Get field metadata using MCP
mcp_get_field_metadata() {
    local object="$1"
    local field="$2"
    local org_alias="${3:-}"
    
    local query="SELECT QualifiedApiName, DataType, IsNillable, DefaultValue FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${object}' AND QualifiedApiName = '${field}'"
    mcp_query "$query" "$org_alias" true
}

# Create/Update records using MCP
mcp_upsert_records() {
    local object="$1"
    local csv_file="$2"
    local external_id="${3:-Id}"
    local org_alias="${4:-}"
    
    if check_mcp_availability 2>/dev/null; then
        # Use MCP tool for bulk operations
        node "$MCP_TOOLS_DIR/bulk-upsert.js" \
            --object "$object" \
            --file "$csv_file" \
            --externalId "$external_id" \
            --org "$org_alias" 2>/dev/null
    else
        # Fallback to CLI
        sf data import bulk \
            --sobject "$object" \
            --file "$csv_file" \
            --external-id "$external_id" \
            --target-org "$org_alias" \
            --wait 10
    fi
}

# Get org limits using MCP
mcp_get_org_limits() {
    local org_alias="${1:-}"
    
    if check_mcp_availability 2>/dev/null; then
        node "$MCP_TOOLS_DIR/get-limits.js" --org "$org_alias" 2>/dev/null
    else
        sf limits api display --json --target-org "$org_alias"
    fi
}

# Deploy metadata using MCP
mcp_deploy_metadata() {
    local source_path="$1"
    local org_alias="${2:-}"
    
    if check_mcp_availability 2>/dev/null; then
        node "$MCP_TOOLS_DIR/deploy-metadata.js" \
            --source "$source_path" \
            --org "$org_alias" 2>/dev/null
    else
        sf project deploy start \
            --source-dir "$source_path" \
            --target-org "$org_alias" \
            --wait 10
    fi
}

# Check field-level security using MCP
mcp_check_field_permissions() {
    local object="$1"
    local field="$2"
    local profile="${3:-System Administrator}"
    local org_alias="${4:-}"
    
    local query="SELECT Field, PermissionsEdit, PermissionsRead FROM FieldPermissions WHERE SobjectType = '${object}' AND Field = '${object}.${field}' AND Parent.Profile.Name = '${profile}'"
    mcp_query "$query" "$org_alias"
}

# Utility function to initialize MCP adapter
init_mcp_adapter() {
    # Check and report MCP availability
    if check_mcp_availability; then
        echo -e "${GREEN}MCP tools available and configured${NC}"
        export MCP_AVAILABLE=true
    else
        echo -e "${YELLOW}MCP tools not available, using CLI fallback${NC}"
        export MCP_AVAILABLE=false
    fi
    
    # Create MCP tools directory if it doesn't exist
    if [[ ! -d "$MCP_TOOLS_DIR" ]]; then
        mkdir -p "$MCP_TOOLS_DIR"
    fi
}

# Export functions for use by other scripts
export -f check_mcp_availability
export -f mcp_execute
export -f mcp_query
export -f mcp_get_record_types
export -f mcp_get_picklist_values
export -f mcp_validate_csv
export -f mcp_get_field_metadata
export -f mcp_upsert_records
export -f mcp_get_org_limits
export -f mcp_deploy_metadata
export -f mcp_check_field_permissions
export -f init_mcp_adapter