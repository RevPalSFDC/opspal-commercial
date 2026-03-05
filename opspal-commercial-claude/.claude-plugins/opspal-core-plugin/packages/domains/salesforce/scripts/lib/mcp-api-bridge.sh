#!/bin/bash

# MCP-API Bridge Library
# Provides unified interface for Salesforce operations with intelligent MCP/API routing
# Automatically falls back to API when MCP tools are insufficient

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Track operation metrics (Salesforce scope)
# Attempt to source env for LOG_DIR; fall back gracefully
if [[ -z "${LOG_DIR:-}" ]] && [[ -f "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh" ]]; then
  # shellcheck source=env.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"
fi
OPERATION_LOG="${LOG_DIR:-${HOME}/.local/state/claudesfdc/logs}/mcp-api-operations.log"
mkdir -p "$(dirname "$OPERATION_LOG")" 2>/dev/null || true
touch "$OPERATION_LOG"

log_operation() {
    local operation="$1"
    local method="$2"  # MCP or API
    local status="$3"  # SUCCESS or FAILURE
    local duration="$4"
    
    echo "$(date -Iseconds)|$operation|$method|$status|$duration" >> "$OPERATION_LOG"
}

# ============================================================================
# INTELLIGENT ROUTING FUNCTIONS
# ============================================================================

# Determine best method for operation
determine_method() {
    local operation="$1"
    
    # Operations that MUST use API
    case "$operation" in
        scratch_org_*|sandbox_refresh|package_install|validation_deploy|quick_deploy|ui_generate_*)
            echo "API"
            ;;
        # Operations that prefer MCP
        data_query|field_create|object_create|report_create|user_create|permission_assign)
            echo "MCP"
            ;;
        # Operations that can use either (prefer MCP)
        *)
            echo "MCP_WITH_FALLBACK"
            ;;
    esac
}

# ============================================================================
# SCRATCH ORG OPERATIONS (API-Only)
# ============================================================================

create_scratch_org() {
    local config_file="${1:-config/project-scratch-def.json}"
    local alias="${2:-scratch-$(date +%Y%m%d-%H%M%S)}"
    local duration="${3:-7}"
    
    log_info "Creating scratch org: $alias (duration: $duration days)"
    
    local start_time=$(date +%s)
    
    if sf org create scratch \
        --definition-file "$config_file" \
        --alias "$alias" \
        --duration-days "$duration" \
        --set-default \
        --json 2>/dev/null; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log_operation "create_scratch_org" "API" "SUCCESS" "$duration"
        log_success "Scratch org created: $alias"
        
        # Push source to new org
        sf project deploy start --target-org "$alias" 2>/dev/null || true
        
        echo "$alias"
        return 0
    else
        log_operation "create_scratch_org" "API" "FAILURE" "0"
        log_error "Failed to create scratch org"
        return 1
    fi
}

delete_scratch_org() {
    local alias="$1"
    
    if [ -z "$alias" ]; then
        log_error "Scratch org alias required"
        return 1
    fi
    
    log_info "Deleting scratch org: $alias"
    
    if sf org delete scratch --target-org "$alias" --no-prompt 2>/dev/null; then
        log_success "Scratch org deleted: $alias"
        return 0
    else
        log_error "Failed to delete scratch org: $alias"
        return 1
    fi
}

# ============================================================================
# UI METADATA GENERATION (API-Only)
# ============================================================================

generate_page_layout() {
    local object="$1"
    local layout_name="$2"
    local output_dir="${3:-force-app/main/default/layouts}"
    
    log_info "Generating page layout: $layout_name for $object"
    
    mkdir -p "$output_dir"
    
    # Generate basic layout structure
    cat > "$output_dir/${object}-${layout_name}.layout-meta.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<Layout xmlns="http://soap.sforce.com/2006/04/metadata">
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <label>Information</label>
        <layoutColumns/>
        <layoutColumns/>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <label>System Information</label>
        <layoutColumns/>
        <layoutColumns/>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>
    <showEmailCheckbox>false</showEmailCheckbox>
    <showHighlightsPanel>false</showHighlightsPanel>
    <showInteractionLogPanel>false</showInteractionLogPanel>
    <showRunAssignmentRulesCheckbox>false</showRunAssignmentRulesCheckbox>
    <showSubmitAndAttachButton>false</showSubmitAndAttachButton>
</Layout>
EOF
    
    log_success "Page layout generated: ${object}-${layout_name}"
    return 0
}

generate_lightning_page() {
    local object="$1"
    local page_name="$2"
    local output_dir="${3:-force-app/main/default/flexipages}"
    
    log_info "Generating Lightning page: $page_name for $object"
    
    mkdir -p "$output_dir"
    
    # Generate basic flexipage structure
    cat > "$output_dir/${page_name}.flexipage-meta.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentName>force:detailPanel</componentName>
            </componentInstance>
        </itemInstances>
        <name>main</name>
        <type>Region</type>
    </flexiPageRegions>
    <masterLabel>$page_name</masterLabel>
    <sobjectType>$object</sobjectType>
    <template>
        <name>flexipage:defaultRecordHomeTemplate</name>
    </template>
    <type>RecordPage</type>
</FlexiPage>
EOF
    
    log_success "Lightning page generated: $page_name"
    return 0
}

# ============================================================================
# DEPLOYMENT OPERATIONS (Hybrid MCP/API)
# ============================================================================

validate_deployment() {
    local source_path="${1:-.}"
    local target_org="${2:-$SF_TARGET_ORG}"
    
    log_info "Validating deployment to: $target_org"
    
    local start_time=$(date +%s)
    
    # API-only operation - validation deployment
    if sf project deploy start \
        --source-dir "$source_path" \
        --target-org "$target_org" \
        --dry-run \
        --json 2>/dev/null | jq -r '.result.id' > "${TMP_DIR:-/tmp}/validation_id.txt"; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        local validation_id=$(cat "${TMP_DIR:-/tmp}/validation_id.txt")
        
        log_operation "validate_deployment" "API" "SUCCESS" "$duration"
        log_success "Validation successful. ID: $validation_id"
        echo "$validation_id"
        return 0
    else
        log_operation "validate_deployment" "API" "FAILURE" "0"
        log_error "Validation failed"
        return 1
    fi
}

quick_deploy() {
    local validation_id="$1"
    local target_org="${2:-$SF_TARGET_ORG}"
    
    if [ -z "$validation_id" ]; then
        log_error "Validation ID required for quick deploy"
        return 1
    fi
    
    log_info "Quick deploying validation: $validation_id"
    
    # API-only operation
    if sf project deploy quick \
        --job-id "$validation_id" \
        --target-org "$target_org" \
        --json 2>/dev/null; then
        
        log_success "Quick deploy successful"
        return 0
    else
        log_error "Quick deploy failed"
        return 1
    fi
}

# ============================================================================
# DATA OPERATIONS (MCP with API Fallback)
# ============================================================================

query_data() {
    local soql="$1"
    local target_org="${2:-$SF_TARGET_ORG}"
    local use_bulk="${3:-false}"
    
    log_info "Executing query: $soql"
    
    local start_time=$(date +%s)
    
    # Try MCP first (assuming MCP tool is available)
    if command -v mcp_salesforce_data_query &>/dev/null; then
        if result=$(mcp_salesforce_data_query --query "$soql" 2>/dev/null); then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            log_operation "query_data" "MCP" "SUCCESS" "$duration"
            echo "$result"
            return 0
        fi
    fi
    
    # Fallback to API
    log_warning "MCP query failed, falling back to API"
    
    if [ "$use_bulk" = "true" ]; then
        result=$(sf data query \
            --query "$soql" \
            --bulk \
            --wait 10 \
            --target-org "$target_org" \
            --json 2>/dev/null | jq -r '.result.records')
    else
        result=$(sf data query \
            --query "$soql" \
            --target-org "$target_org" \
            --json 2>/dev/null | jq -r '.result.records')
    fi
    
    if [ $? -eq 0 ]; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_operation "query_data" "API" "SUCCESS" "$duration"
        echo "$result"
        return 0
    else
        log_operation "query_data" "API" "FAILURE" "0"
        log_error "Query failed via both MCP and API"
        return 1
    fi
}

# ============================================================================
# PACKAGE OPERATIONS (API-Only)
# ============================================================================

install_package() {
    local package_id="$1"
    local target_org="${2:-$SF_TARGET_ORG}"
    local wait="${3:-10}"
    
    log_info "Installing package: $package_id"
    
    if sf package install \
        --package "$package_id" \
        --target-org "$target_org" \
        --wait "$wait" \
        --publish-wait "$wait" \
        --json 2>/dev/null; then
        
        log_success "Package installed successfully"
        return 0
    else
        log_error "Package installation failed"
        return 1
    fi
}

# ============================================================================
# MONITORING AND REPORTING
# ============================================================================

show_operation_stats() {
    if [ ! -f "$OPERATION_LOG" ]; then
        log_warning "No operation statistics available"
        return
    fi
    
    echo "=== MCP-API Bridge Operation Statistics ==="
    echo
    
    # Calculate stats
    local total_ops=$(wc -l < "$OPERATION_LOG")
    local mcp_success=$(grep "|MCP|SUCCESS|" "$OPERATION_LOG" | wc -l)
    local mcp_failure=$(grep "|MCP|FAILURE|" "$OPERATION_LOG" | wc -l)
    local api_success=$(grep "|API|SUCCESS|" "$OPERATION_LOG" | wc -l)
    local api_failure=$(grep "|API|FAILURE|" "$OPERATION_LOG" | wc -l)
    
    echo "Total Operations: $total_ops"
    echo
    echo "MCP Operations:"
    echo "  Success: $mcp_success"
    echo "  Failure: $mcp_failure"
    if [ $((mcp_success + mcp_failure)) -gt 0 ]; then
        echo "  Success Rate: $(( mcp_success * 100 / (mcp_success + mcp_failure) ))%"
    fi
    echo
    echo "API Operations:"
    echo "  Success: $api_success"
    echo "  Failure: $api_failure"
    if [ $((api_success + api_failure)) -gt 0 ]; then
        echo "  Success Rate: $(( api_success * 100 / (api_success + api_failure) ))%"
    fi
    echo
    
    # Show recent operations
    echo "Recent Operations:"
    tail -5 "$OPERATION_LOG" | while IFS='|' read -r timestamp op method status duration; do
        echo "  $timestamp: $op via $method - $status (${duration}s)"
    done
}

# ============================================================================
# INTELLIGENT OPERATION EXECUTOR
# ============================================================================

execute_operation() {
    local operation="$1"
    shift
    local args=("$@")
    
    local method=$(determine_method "$operation")
    
    case "$method" in
        API)
            log_info "Executing $operation via API (MCP not available)"
            ;;
        MCP)
            log_info "Executing $operation via MCP"
            ;;
        MCP_WITH_FALLBACK)
            log_info "Executing $operation via MCP with API fallback"
            ;;
    esac
    
    # Route to appropriate function
    case "$operation" in
        create_scratch_org)
            create_scratch_org "${args[@]}"
            ;;
        delete_scratch_org)
            delete_scratch_org "${args[@]}"
            ;;
        generate_page_layout)
            generate_page_layout "${args[@]}"
            ;;
        generate_lightning_page)
            generate_lightning_page "${args[@]}"
            ;;
        validate_deployment)
            validate_deployment "${args[@]}"
            ;;
        quick_deploy)
            quick_deploy "${args[@]}"
            ;;
        query_data)
            query_data "${args[@]}"
            ;;
        install_package)
            install_package "${args[@]}"
            ;;
        *)
            log_error "Unknown operation: $operation"
            return 1
            ;;
    esac
}

# Export functions for use by other scripts
export -f determine_method
export -f create_scratch_org
export -f delete_scratch_org
export -f generate_page_layout
export -f generate_lightning_page
export -f validate_deployment
export -f quick_deploy
export -f query_data
export -f install_package
export -f show_operation_stats
export -f execute_operation
